//! Inert authenticated DEK envelope; see docs/ENCRYPTED_STORAGE_ENVELOPE.md.
#![allow(dead_code)] // Deliberately not integrated with storage yet.
use argon2::{
    password_hash::rand_core::{OsRng, RngCore},
    Algorithm, Argon2, Block, Params, Version,
};
use chacha20poly1305::{
    aead::{AeadInPlace, KeyInit},
    Tag, XChaCha20Poly1305, XNonce,
};
use zeroize::Zeroizing;

pub(crate) mod remembered_key;

const MAGIC: &[u8; 8] = b"VELAYKEY";
const DOMAIN: &[u8; 26] = b"com.velay.app/key-envelope";

const HEADER: usize = 43;
const SLOT: usize = 88;
pub(crate) const ENCODED_LENGTH: usize = HEADER + 2 * SLOT;
const LENGTH: usize = ENCODED_LENGTH;
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) struct EnvelopeContext {
    pub(crate) database_id: [u8; 16],
    pub(crate) generation_id: [u8; 16],
}
pub(crate) struct DataKey(Zeroizing<[u8; 32]>, EnvelopeContext);
pub(crate) struct EnvelopeBytes([u8; LENGTH]);
impl EnvelopeBytes {
    pub(crate) fn as_bytes(&self) -> &[u8] {
        &self.0
    }
}
pub(crate) enum UnlockSecret<'a> {
    Password(&'a str),
    Recovery(&'a str),
}
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum EnvelopeError {
    InvalidSecret,
    Malformed,
    UnsupportedVersion,
    UnsupportedProfile,
    ContextMismatch,
    AuthenticationFailed,
    RandomUnavailable,
    CryptoConfiguration,
}
type Result<T> = std::result::Result<T, EnvelopeError>;
pub(crate) fn create(
    context: &EnvelopeContext,
    password: &str,
    recovery: &str,
) -> Result<(DataKey, EnvelopeBytes)> {
    create_random(context, password, recovery, &mut |buffer| {
        OsRng
            .try_fill_bytes(buffer)
            .map_err(|_| EnvelopeError::RandomUnavailable)
    })
}
fn create_random(
    context: &EnvelopeContext,
    password: &str,
    recovery: &str,
    random: &mut impl FnMut(&mut [u8]) -> Result<()>,
) -> Result<(DataKey, EnvelopeBytes)> {
    validate_secret(password)?;
    validate_secret(recovery)?;
    let mut key = DataKey(Zeroizing::new([0; 32]), *context);
    random(key.0.as_mut())?;
    let mut bytes = EnvelopeBytes([0; LENGTH]);
    bytes.0[..8].copy_from_slice(MAGIC);
    bytes.0[8..11].copy_from_slice(&[1, 1, 1]);
    bytes.0[11..27].copy_from_slice(&context.database_id);
    bytes.0[27..43].copy_from_slice(&context.generation_id);
    // All metadata must exist before either slot's AAD is constructed.
    for role in 0..2 {
        let start = HEADER + role * SLOT;
        random(&mut bytes.0[start..start + 16])?;
        random(&mut bytes.0[start + 16..start + 40])?;
    }
    for (role, secret) in [password, recovery].into_iter().enumerate() {
        let start = HEADER + role * SLOT;
        let derived = derive(secret, &bytes.0[start..start + 16])?;
        let cipher = XChaCha20Poly1305::new((&*derived).into());
        let mut plaintext = Zeroizing::new([0; 32]);
        plaintext.copy_from_slice(key.0.as_ref());
        let tag = cipher
            .encrypt_in_place_detached(
                XNonce::from_slice(&bytes.0[start + 16..start + 40]),
                &aad(&bytes.0, role),
                plaintext.as_mut(),
            )
            .map_err(|_| EnvelopeError::CryptoConfiguration)?;
        bytes.0[start + 40..start + 72].copy_from_slice(plaintext.as_ref());
        bytes.0[start + 72..start + 88].copy_from_slice(&tag);
    }
    Ok((key, bytes))
}
/// Checks framing/profile/context only. Does not authenticate credentials or disk context.
pub(crate) fn validate_framing(bytes: &[u8], context: &EnvelopeContext) -> Result<()> {
    if bytes.len() != LENGTH || &bytes[..8] != MAGIC {
        return Err(EnvelopeError::Malformed);
    }
    if bytes[8] != 1 {
        return Err(EnvelopeError::UnsupportedVersion);
    }
    if bytes[9] != 1 || bytes[10] != 1 {
        return Err(EnvelopeError::UnsupportedProfile);
    }
    if bytes[11..27] != context.database_id || bytes[27..43] != context.generation_id {
        return Err(EnvelopeError::ContextMismatch);
    }
    Ok(())
}
pub(crate) fn unlock(
    bytes: &[u8],
    context: &EnvelopeContext,
    secret: UnlockSecret<'_>,
) -> Result<DataKey> {
    // No allocations or KDF before fixed framing, identifiers and secret bounds.
    validate_framing(bytes, context)?;
    let (role, secret) = match secret {
        UnlockSecret::Password(s) => (0, s),
        UnlockSecret::Recovery(s) => (1, s),
    };
    validate_secret(secret)?;
    let start = HEADER + role * SLOT;
    let derived = derive(secret, &bytes[start..start + 16])?;
    let cipher = XChaCha20Poly1305::new((&*derived).into());
    let mut key = DataKey(Zeroizing::new([0; 32]), *context);
    key.0.copy_from_slice(&bytes[start + 40..start + 72]);
    cipher
        .decrypt_in_place_detached(
            XNonce::from_slice(&bytes[start + 16..start + 40]),
            &aad(bytes, role),
            key.0.as_mut(),
            Tag::from_slice(&bytes[start + 72..start + 88]),
        )
        .map_err(|_| EnvelopeError::AuthenticationFailed)?;
    Ok(key)
}
fn validate_secret(secret: &str) -> Result<()> {
    if !(8..=1024).contains(&secret.len()) {
        return Err(EnvelopeError::InvalidSecret);
    }
    Ok(())
}
fn derive(secret: &str, salt: &[u8]) -> Result<Zeroizing<[u8; 32]>> {
    #[cfg(test)]
    KDF_CALLS.with(|calls| calls.set(calls.get() + 1));
    let params =
        Params::new(19_456, 2, 1, Some(32)).map_err(|_| EnvelopeError::CryptoConfiguration)?;
    // The convenience allocating Argon2 interface does not wipe its memory Vec.
    let mut memory = Zeroizing::new(vec![Block::default(); params.block_count()]);
    let mut derived = Zeroizing::new([0; 32]);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into_with_memory(
            secret.as_bytes(),
            salt,
            derived.as_mut(),
            memory.as_mut_slice(),
        )
        .map_err(|_| EnvelopeError::CryptoConfiguration)?;
    Ok(derived)
}
fn aad(bytes: &[u8], role: usize) -> [u8; 142] {
    let mut result = [0; 142];
    result[..26].copy_from_slice(DOMAIN);
    result[26..61].copy_from_slice(&bytes[8..HEADER]);
    result[61] = role as u8;
    result[62..102].copy_from_slice(&bytes[HEADER..HEADER + 40]);
    result[102..].copy_from_slice(&bytes[HEADER + SLOT..HEADER + SLOT + 40]);
    result
}
#[cfg(test)]
thread_local! { static KDF_CALLS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) }; }

#[cfg(test)]
mod tests {
    use super::*;
    const PASSWORD: &str = "Password with spaces";
    const RECOVERY: &str = "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789";
    fn context() -> EnvelopeContext {
        EnvelopeContext {
            database_id: [1; 16],
            generation_id: [2; 16],
        }
    }
    fn fixture() -> (DataKey, EnvelopeBytes) {
        create(&context(), PASSWORD, RECOVERY).unwrap()
    }
    fn denied<T>(result: Result<T>, error: EnvelopeError) {
        assert!(matches!(result, Err(actual) if actual == error));
    }
    #[test]
    fn both_roles_unlock_the_same_fresh_key() {
        let (key, bytes) = fixture();
        for secret in [
            UnlockSecret::Password(PASSWORD),
            UnlockSecret::Recovery(RECOVERY),
        ] {
            let opened = unlock(bytes.as_bytes(), &context(), secret).unwrap();
            assert!(key.0.as_ref() == opened.0.as_ref());
        }
        let (other, second) = fixture();
        assert!(key.0.as_ref() != other.0.as_ref());
        for start in [HEADER, HEADER + 16, HEADER + SLOT, HEADER + SLOT + 16] {
            let size = if start == HEADER || start == HEADER + SLOT {
                16
            } else {
                24
            };
            assert!(bytes.0[start..start + size] != second.0[start..start + size]);
        }
        assert!(bytes.0[HEADER..HEADER + 16] != bytes.0[HEADER + SLOT..HEADER + SLOT + 16]);
        assert!(
            bytes.0[HEADER + 16..HEADER + 40] != bytes.0[HEADER + SLOT + 16..HEADER + SLOT + 40]
        );
    }
    #[test]
    fn wrong_secrets_and_cross_role_substitution_fail_closed() {
        let (_, bytes) = fixture();
        for secret in [
            UnlockSecret::Password("wrong-password"),
            UnlockSecret::Recovery("wrong-recovery"),
            UnlockSecret::Password(RECOVERY),
            UnlockSecret::Recovery(PASSWORD),
        ] {
            denied(
                unlock(bytes.as_bytes(), &context(), secret),
                EnvelopeError::AuthenticationFailed,
            );
        }
    }
    #[test]
    fn selected_ciphertext_tag_and_either_slots_metadata_are_authenticated() {
        let (_, bytes) = fixture();
        for role in 0..2 {
            for offset in [
                HEADER,
                HEADER + 16,
                HEADER + SLOT,
                HEADER + SLOT + 16,
                HEADER + role * SLOT + 40,
                HEADER + role * SLOT + 72,
            ] {
                let mut changed = bytes.0;
                changed[offset] ^= 1;
                let secret = if role == 0 {
                    UnlockSecret::Password(PASSWORD)
                } else {
                    UnlockSecret::Recovery(RECOVERY)
                };
                denied(
                    unlock(&changed, &context(), secret),
                    EnvelopeError::AuthenticationFailed,
                );
            }
        }
    }
    #[test]
    fn unused_ciphertext_is_checked_only_by_its_role() {
        let (key, bytes) = fixture();
        for offset in [HEADER + SLOT + 40, HEADER + SLOT + 72] {
            let mut changed = bytes.0;
            changed[offset] ^= 1;
            let opened = unlock(&changed, &context(), UnlockSecret::Password(PASSWORD)).unwrap();
            assert!(key.0.as_ref() == opened.0.as_ref());
            denied(
                unlock(&changed, &context(), UnlockSecret::Recovery(RECOVERY)),
                EnvelopeError::AuthenticationFailed,
            );
        }
    }
    #[test]
    fn swaps_and_database_generation_transplants_fail() {
        let (_, bytes) = fixture();
        let mut swapped = bytes.0;
        for i in 0..SLOT {
            swapped.swap(HEADER + i, HEADER + SLOT + i);
        }
        for secret in [
            UnlockSecret::Password(PASSWORD),
            UnlockSecret::Recovery(RECOVERY),
        ] {
            denied(
                unlock(&swapped, &context(), secret),
                EnvelopeError::AuthenticationFailed,
            );
        }
        // Even equal input strings must not make the roles interchangeable.
        let (_, equal_secrets) = create(&context(), PASSWORD, PASSWORD).unwrap();
        let mut swapped_equal = equal_secrets.0;
        for i in 0..SLOT {
            swapped_equal.swap(HEADER + i, HEADER + SLOT + i);
        }
        for secret in [
            UnlockSecret::Password(PASSWORD),
            UnlockSecret::Recovery(PASSWORD),
        ] {
            denied(
                unlock(&swapped_equal, &context(), secret),
                EnvelopeError::AuthenticationFailed,
            );
        }
        for generation in [false, true] {
            let mut other = context();
            if generation {
                other.generation_id[0] ^= 1;
            } else {
                other.database_id[0] ^= 1;
            }
            denied(
                unlock(bytes.as_bytes(), &other, UnlockSecret::Password(PASSWORD)),
                EnvelopeError::ContextMismatch,
            );
            let (_, destination) = create(&other, PASSWORD, RECOVERY).unwrap();
            for role in 0..2 {
                let mut transplanted = destination.0;
                let start = HEADER + role * SLOT;
                transplanted[start..start + SLOT].copy_from_slice(&bytes.0[start..start + SLOT]);
                let secret = if role == 0 {
                    UnlockSecret::Password(PASSWORD)
                } else {
                    UnlockSecret::Recovery(RECOVERY)
                };
                denied(
                    unlock(&transplanted, &other, secret),
                    EnvelopeError::AuthenticationFailed,
                );
            }
        }
    }
    #[test]
    fn framing_context_and_input_rejections_do_not_run_kdf() {
        let (_, bytes) = fixture();
        let mut cases = Vec::new();
        for (offset, error) in [
            (0, EnvelopeError::Malformed),
            (8, EnvelopeError::UnsupportedVersion),
            (9, EnvelopeError::UnsupportedProfile),
            (10, EnvelopeError::UnsupportedProfile),
            (11, EnvelopeError::ContextMismatch),
            (27, EnvelopeError::ContextMismatch),
        ] {
            let mut changed = bytes.0.to_vec();
            changed[offset] ^= 127;
            cases.push((changed, error));
        }
        cases.push((bytes.0[..LENGTH - 1].to_vec(), EnvelopeError::Malformed));
        cases.push(([bytes.as_bytes(), &[0]].concat(), EnvelopeError::Malformed));
        cases.push((vec![0; 1_000_000], EnvelopeError::Malformed));
        for (changed, error) in cases {
            KDF_CALLS.with(|calls| calls.set(0));
            denied(
                unlock(&changed, &context(), UnlockSecret::Password(PASSWORD)),
                error,
            );
            KDF_CALLS.with(|calls| assert_eq!(calls.get(), 0));
        }
        for secret in ["1234567".to_owned(), "a".repeat(1025), "é".repeat(3)] {
            KDF_CALLS.with(|calls| calls.set(0));
            denied(
                create(&context(), &secret, RECOVERY),
                EnvelopeError::InvalidSecret,
            );
            denied(
                create(&context(), PASSWORD, &secret),
                EnvelopeError::InvalidSecret,
            );
            denied(
                unlock(
                    bytes.as_bytes(),
                    &context(),
                    UnlockSecret::Password(&secret),
                ),
                EnvelopeError::InvalidSecret,
            );
            denied(
                unlock(
                    bytes.as_bytes(),
                    &context(),
                    UnlockSecret::Recovery(&secret),
                ),
                EnvelopeError::InvalidSecret,
            );
            KDF_CALLS.with(|calls| assert_eq!(calls.get(), 0));
        }
    }
    #[test]
    fn boundaries_are_utf8_bytes_and_secrets_are_exact() {
        for password in [
            "12345678".to_owned(),
            "a".repeat(1024),
            "é".repeat(4),
            "é".repeat(512),
        ] {
            let (key, bytes) = create(&context(), &password, &password).unwrap();
            for secret in [
                UnlockSecret::Password(&password),
                UnlockSecret::Recovery(&password),
            ] {
                let opened = unlock(bytes.as_bytes(), &context(), secret).unwrap();
                assert!(key.0.as_ref() == opened.0.as_ref());
            }
        }
        let (_, bytes) = fixture();
        for password in [
            "password with spaces",
            "Password with spaces ",
            " Password with spaces",
        ] {
            denied(
                unlock(
                    bytes.as_bytes(),
                    &context(),
                    UnlockSecret::Password(password),
                ),
                EnvelopeError::AuthenticationFailed,
            );
        }
        for recovery in [
            RECOVERY.to_lowercase(),
            format!(" {RECOVERY}"),
            format!("{RECOVERY} "),
        ] {
            denied(
                unlock(
                    bytes.as_bytes(),
                    &context(),
                    UnlockSecret::Recovery(&recovery),
                ),
                EnvelopeError::AuthenticationFailed,
            );
        }
        let (key, bytes) = create(&context(), PASSWORD, "éééé").unwrap();
        let opened = unlock(bytes.as_bytes(), &context(), UnlockSecret::Recovery("éééé")).unwrap();
        assert!(key.0.as_ref() == opened.0.as_ref());
        denied(
            unlock(
                bytes.as_bytes(),
                &context(),
                UnlockSecret::Recovery("e\u{301}e\u{301}e\u{301}e\u{301}"),
            ),
            EnvelopeError::AuthenticationFailed,
        );
    }
    #[test]
    fn random_failure_at_each_draw_returns_no_partial_result() {
        for fail_at in 0..5 {
            let mut draws = 0;
            let result = create_random(&context(), PASSWORD, RECOVERY, &mut |buffer| {
                let fail = draws == fail_at;
                draws += 1;
                buffer.fill(42);
                if fail {
                    Err(EnvelopeError::RandomUnavailable)
                } else {
                    Ok(())
                }
            });
            denied(result, EnvelopeError::RandomUnavailable);
            assert_eq!(draws, fail_at + 1);
        }
    }
}
