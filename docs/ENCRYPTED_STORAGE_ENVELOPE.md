# Authenticated key-envelope core (inert V1)

`infrastructure::key_envelope` creates a fresh data-encryption key (DEK) and
wraps it independently for a password and recovery secret. This crate-private
deep module is **not wired into application storage**. No database is encrypted
or migrated by this change; startup and existing Catalog access are unchanged.

## Interface and caller obligations

- `create(&EnvelopeContext, password, recovery)` returns `(DataKey, EnvelopeBytes)`.
  Each call generates a new random 32-byte DEK, two salts and two nonces.
- `unlock(bytes, &expected_context, UnlockSecret::Password/Recovery)` returns
  a `DataKey` only after authenticating the selected slot.
- `EnvelopeContext` contains 16-byte database and generation IDs. Callers must
  obtain the expected IDs from a trusted generation protocol, not simply accept
  IDs from the envelope being checked. This module does not establish that trust.
- `EnvelopeBytes::as_bytes()` exposes ciphertext framing, never plaintext keys.
  `DataKey` has private zeroizing storage, no Debug, Clone, Copy, serialization,
  equality implementation or plaintext-byte accessor. A narrow key-borrow
  interface is deferred until SQLCipher integration. No supplied-DEK constructor
  or rewrap operation exists.

Both secrets are borrowed UTF-8 strings, validated as **8 through 1024 bytes**
inclusive, consistent with current Catalog hashing. Spaces, case and Unicode
representation are significant; neither secret is trimmed or normalized.
Recovery creation callers must supply a high-entropy recovery secret, not a
human password. Existing recovery generation produces 48 uppercase hex characters
from 24 random bytes outside this module. This module neither generates nor
confirms recovery codes and does not impose a new UI format rule.

## Fixed V1 encoding

Exactly **219 bytes**, no JSON, variable-length fields or encoded KDF costs.
All fields below are raw fixed-width bytes; numeric discriminants are one byte.
Unknown versions/suites/profiles are rejected, not interpreted or downgraded.

| Offset | Length | Meaning |
| --- | ---: | --- |
| 0 | 8 | ASCII `VELAYKEY` magic |
| 8 | 1 | Version: `1` |
| 9 | 1 | Suite: `1` = XChaCha20Poly1305 (32-byte key, 24-byte nonce, 16-byte tag) |
| 10 | 1 | KDF profile: `1` = Argon2id v19, m=19456 KiB, t=2, p=1, output=32 bytes |
| 11 | 16 | Database ID |
| 27 | 16 | Generation ID |
| 43 | 88 | Password slot (role `0`) |
| 131 | 88 | Recovery slot (role `1`) |

Each 88-byte slot contains salt `[0,16)`, nonce `[16,40)`, wrapped DEK
ciphertext `[40,72)` and detached tag `[72,88)`. Salts and nonces are independent
OS-random draws. The DEK is a separate OS-random draw. A failed draw returns no
partial result. Randomness uses `OsRng.try_fill_bytes` from the existing
`argon2::password_hash::rand_core` re-export.

The canonical 142-byte AAD is the concatenation, in this exact order:

1. ASCII `com.velay.app/key-envelope` (26 bytes; no NUL terminator).
2. Version, suite, profile, database ID, generation ID (wire bytes `[8,43)`).
3. Selected role (`0` or `1`, one byte).
4. Password salt and nonce (40 bytes).
5. Recovery salt and nonce (40 bytes).

Each slot uses its own Argon2-derived wrapping key. Different salts and role AAD
prevent slot substitution, including when both supplied secret strings happen
to match. Serialization is manual fixed framing, not a custom crypto primitive.

**Authentication is per selected slot.** Tampering with either slot's salt or
nonce invalidates either unlock path. Tampering with only the unused slot's
ciphertext/tag is detected when that slot is used, not when the other unlocks.
There is intentionally no claim of whole-envelope authentication on one unlock.

## Bounded failures

Errors contain no inputs, key bytes, raw library errors or logs:

| Error | Condition |
| --- | --- |
| `InvalidSecret` | Either secret outside 8..=1024 UTF-8 bytes |
| `Malformed` | Wrong total length (including trailing bytes) or magic |
| `UnsupportedVersion` | Version other than 1 |
| `UnsupportedProfile` | Unknown suite or KDF profile |
| `ContextMismatch` | Database/generation IDs differ from expected context |
| `AuthenticationFailed` | Wrong valid-length secret or selected slot authentication failure |
| `RandomUnavailable` | OS randomness failed during creation |
| `CryptoConfiguration` | Code-owned Argon2/AEAD configuration failure |

Unlock checks length/magic, version, suite/profile, expected IDs, and secret
bounds **before any KDF or allocation**. Creation checks both secret bounds
before randomness or KDF. Attacker input never controls Argon2 costs.

## Memory hygiene and limits

DEKs, derived wrapping keys and temporary 32-byte plaintext use fixed-size
`Zeroizing` buffers, including failure paths. Detached in-place AEAD avoids
secret-bearing Vec growth. The main Argon2 memory allocation is a
`Zeroizing<Vec<Block>>`, passed to `hash_password_into_with_memory`; the ordinary
allocating convenience method does not wipe that allocation. The existing
password-hash flow is unchanged, except enabling Argon2's `zeroize` feature.

Dependency source audit (locked RustCrypto versions):

- `chacha20poly1305` 0.10.1 `src/lib.rs`: `ChaChaPoly1305` implements Drop
  (wipes its key) and `ZeroizeOnDrop`. Its Cargo manifest enables `chacha20`'s
  `zeroize` feature. `src/cipher.rs` explicitly wipes the temporary MAC key and
  authenticates before decrypting.
- `chacha20` 0.9.1 `src/lib.rs` and `src/xchacha.rs`: the enabled feature wipes
  core state on drop and supplies `ZeroizeOnDrop`; cipher wrapper buffers are
  covered by `cipher`'s enabled zeroize support.
- **Residual limitation:** `poly1305` 0.8.0 has optional backend-state wiping,
  but the AEAD dependency does not enable that optional feature in this graph.
  Its internal MAC state is not claimed wiped. Argon2's feature wipes some
  internal intermediates, not every stack/register copy inside the primitive.

Zeroization is best-effort hygiene, not a guarantee that compiler moves,
registers, dependency intermediates, allocator/OS copies, swap, crash dumps or
caller-owned input strings contain no residual secrets. No move-leak or complete
memory-erasure claim is made. Same-user malware/admin access is not addressed.

## Verification and review path

Read the interface, framing/AAD and error ordering first. Colocated tests exercise
create/unlock for both roles, freshness, wrong/cross-role secrets, selected
ciphertext/tag and metadata mutations, unused-slot limitations, swaps and
cross-database/generation transplants, framing rejection without KDF, byte
boundaries/exact strings, and failure at each random draw. Tests compare keys
only as booleans and never format their bytes; errors are static variants.
The private RNG seam and thread-local KDF counter are bounded test facilities,
not caller-facing extensibility.

```sh
cargo test --manifest-path src-tauri/Cargo.toml --locked --no-default-features --lib infrastructure::key_envelope::tests -- --test-threads=1
cargo test --manifest-path src-tauri/Cargo.toml --locked --test catalog_access
rustfmt --check --edition 2021 src-tauri/src/infrastructure/key_envelope.rs
git diff --check
```

## Deferred integration and security decisions

This core supports only the first T2 slice of S2/S3/S4/S7. It does not implement
filesystem persistence, DPAPI, SQLite keying, admission, metadata-loss policy,
crash recovery, migration, password rotation or UI/IPC. Missing metadata must
never silently authorize reset when those integrations are added.

Context binding is **not whole-pair replay protection**. A complete historical
database/envelope pair remains replayable without a separate trusted anchor.
Full-feature password change/recovery requires a fresh DEK and database generation;
rewrapping alone cannot revoke old material. Old backups retain historical
credential access. A recovery hash cannot recreate a recovery wrapping key or
wrapped DEK: later integration must explicitly resolve recovery-code rotation
on password change. Do not assume the current hash-only flow's retained recovery
hash makes the encrypted recovery wrapper usable after rotation.

Independent security verification is required before parent delivery; this
module and its tests are not evidence of production migration or Windows runtime
integration.
