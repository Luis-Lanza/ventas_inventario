//! Inert current-user remembered DEK; no persistence or Catalog authority.
use super::{DataKey, EnvelopeContext};
use sha2::{Digest, Sha256};
#[cfg(any(windows, test))]
use zeroize::Zeroize;
use zeroize::Zeroizing;

const DOMAIN: &[u8] = b"com.velay.app/remembered-key";
const PREFIX: usize = DOMAIN.len() + 1 + 32;
const RECORD: usize = PREFIX + 32 + 32;
const MAX_CIPHERTEXT: usize = 16 * 1024;

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum RememberedKeyError {
    Unavailable,
    Malformed,
    UnsupportedVersion,
    ContextMismatch,
    NativeFailure,
}
type Result<T> = std::result::Result<T, RememberedKeyError>;
pub(crate) struct RememberedKeyBytes(Zeroizing<Vec<u8>>);
impl RememberedKeyBytes {
    pub(crate) fn as_bytes(&self) -> &[u8] {
        &self.0
    }
}

pub(crate) fn protect(key: &DataKey, context: &EnvelopeContext) -> Result<RememberedKeyBytes> {
    protect_with(key, context, native)
}
pub(crate) fn unprotect(bytes: &[u8], context: &EnvelopeContext) -> Result<DataKey> {
    unprotect_with(bytes, context, native)
}
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Operation {
    Protect,
    Unprotect,
}

// Private, bounded call seam: tests own real allocations, never forged pointers.
#[cfg(any(windows, test))]
struct Output {
    success: bool,
    reported: usize,
    storage: Storage,
}
#[cfg(any(windows, test))]
enum Storage {
    #[cfg(test)]
    Test {
        bytes: Box<[u8]>,
        released: std::rc::Rc<std::cell::Cell<bool>>,
    },
    Empty,
    #[cfg(windows)]
    Windows(windows_sys::Win32::Security::Cryptography::CRYPT_INTEGER_BLOB),
}
#[cfg(any(windows, test))]
impl Drop for Output {
    fn drop(&mut self) {
        match &mut self.storage {
            #[cfg(test)]
            Storage::Test { bytes, released } => {
                bytes.zeroize();
                released.set(bytes.iter().all(|b| *b == 0));
            }
            Storage::Empty => {}
            #[cfg(windows)]
            Storage::Windows(blob) => {
                if !blob.pbData.is_null() {
                    // SAFETY: only DPAPI supplies this LocalAlloc pointer. LocalSize,
                    // not an advertised/test length, bounds the entire allocation wipe.
                    unsafe {
                        let size = LocalSize(blob.pbData.cast());
                        if size != 0 {
                            std::slice::from_raw_parts_mut(blob.pbData, size).zeroize();
                        }
                        #[cfg(test)]
                        let wiped = size != 0
                            && std::slice::from_raw_parts(blob.pbData, size)
                                .iter()
                                .all(|byte| *byte == 0);
                        let remaining =
                            windows_sys::Win32::Foundation::LocalFree(blob.pbData.cast());
                        #[cfg(test)]
                        CLEANUP.with(|observed| observed.set((size, wiped, remaining.is_null())));
                        #[cfg(not(test))]
                        let _ = remaining;
                    }
                }
            }
        }
    }
}
#[cfg(any(windows, test))]
fn finish(output: Output, cap: usize) -> Result<Zeroizing<Vec<u8>>> {
    if !output.success {
        return Err(RememberedKeyError::NativeFailure);
    }
    if output.reported == 0 || output.reported > cap {
        return Err(RememberedKeyError::Malformed);
    }
    let bytes: &[u8] = match &output.storage {
        #[cfg(test)]
        Storage::Test { bytes, .. } => bytes,
        Storage::Empty => return Err(RememberedKeyError::Malformed),
        #[cfg(windows)]
        Storage::Windows(blob) => {
            if blob.pbData.is_null() {
                return Err(RememberedKeyError::Malformed);
            }
            // SAFETY: native call owns the allocation; check its actual size first.
            let size = unsafe { LocalSize(blob.pbData.cast()) };
            if output.reported > size {
                return Err(RememberedKeyError::Malformed);
            }
            unsafe { std::slice::from_raw_parts(blob.pbData, output.reported) }
        }
    };
    if output.reported > bytes.len() {
        return Err(RememberedKeyError::Malformed);
    }
    let mut copy = Zeroizing::new(vec![0; output.reported]);
    copy.copy_from_slice(&bytes[..output.reported]);
    Ok(copy)
}
fn binding(context: &EnvelopeContext) -> Zeroizing<Vec<u8>> {
    let mut bytes = Zeroizing::new(Vec::with_capacity(RECORD));
    bytes.extend_from_slice(DOMAIN);
    bytes.push(1);
    bytes.extend_from_slice(&context.database_id);
    bytes.extend_from_slice(&context.generation_id);
    bytes
}
fn record(key: &DataKey, context: &EnvelopeContext) -> Zeroizing<Vec<u8>> {
    let mut bytes = binding(context);
    bytes.extend_from_slice(key.0.as_ref());
    let digest = checksum(&bytes);
    bytes.extend_from_slice(digest.as_ref());
    bytes
}
fn checksum(bytes: &[u8]) -> Zeroizing<[u8; 32]> {
    let mut digest = Zeroizing::new([0; 32]);
    let mut hash = Sha256::new();
    hash.update(bytes);
    // Write directly into zeroizing output, avoiding an ordinary digest temporary.
    hash.finalize_into((&mut *digest).into());
    digest
}
fn protect_with(
    key: &DataKey,
    context: &EnvelopeContext,
    call: impl FnOnce(Operation, &[u8], &[u8]) -> Result<Zeroizing<Vec<u8>>>,
) -> Result<RememberedKeyBytes> {
    if key.1 != *context {
        return Err(RememberedKeyError::ContextMismatch);
    }
    let plaintext = record(key, context);
    let ciphertext = call(Operation::Protect, &plaintext, &binding(context))?;
    if ciphertext.is_empty() || ciphertext.len() > MAX_CIPHERTEXT {
        return Err(RememberedKeyError::Malformed);
    }
    Ok(RememberedKeyBytes(ciphertext))
}
fn unprotect_with(
    bytes: &[u8],
    context: &EnvelopeContext,
    call: impl FnOnce(Operation, &[u8], &[u8]) -> Result<Zeroizing<Vec<u8>>>,
) -> Result<DataKey> {
    if bytes.is_empty() || bytes.len() > MAX_CIPHERTEXT {
        return Err(RememberedKeyError::Malformed);
    }
    let plaintext = call(Operation::Unprotect, bytes, &binding(context))?;
    if plaintext.len() != RECORD || &plaintext[..DOMAIN.len()] != DOMAIN {
        return Err(RememberedKeyError::Malformed);
    }
    if plaintext[DOMAIN.len()] != 1 {
        return Err(RememberedKeyError::UnsupportedVersion);
    }
    if plaintext[..PREFIX] != *binding(context) {
        return Err(RememberedKeyError::ContextMismatch);
    }
    let digest = checksum(&plaintext[..RECORD - 32]);
    if plaintext[RECORD - 32..] != digest[..] {
        return Err(RememberedKeyError::Malformed);
    }
    let mut key = DataKey(Zeroizing::new([0; 32]), *context);
    key.0.copy_from_slice(&plaintext[PREFIX..PREFIX + 32]);
    Ok(key)
}
#[cfg(not(windows))]
fn native(_: Operation, _: &[u8], _: &[u8]) -> Result<Zeroizing<Vec<u8>>> {
    Err(RememberedKeyError::Unavailable)
}

// windows-sys gates this one function behind Win32_System_Memory. Keep the
// dependency's authorized feature addition cryptography-only; use the documented
// kernel32 ABI (SIZE_T LocalSize(HLOCAL)) for allocation-size validation/wiping.
#[cfg(windows)]
#[link(name = "kernel32")]
unsafe extern "system" {
    fn LocalSize(memory: *mut core::ffi::c_void) -> usize;
}

#[cfg(all(test, windows))]
thread_local! { static CLEANUP: std::cell::Cell<(usize, bool, bool)> = const { std::cell::Cell::new((0, false, false)) }; }

#[cfg(windows)]
const FLAGS: u32 = windows_sys::Win32::Security::Cryptography::CRYPTPROTECT_UI_FORBIDDEN;
#[cfg(windows)]
fn native(operation: Operation, bytes: &[u8], entropy: &[u8]) -> Result<Zeroizing<Vec<u8>>> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB,
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: u32::try_from(bytes.len()).map_err(|_| RememberedKeyError::Malformed)?,
        pbData: bytes.as_ptr().cast_mut(),
    };
    let entropy = CRYPT_INTEGER_BLOB {
        cbData: u32::try_from(entropy.len()).map_err(|_| RememberedKeyError::Malformed)?,
        pbData: entropy.as_ptr().cast_mut(),
    };
    // Guard exists BEFORE the call, including failure-with-output paths.
    let mut output = Output {
        success: false,
        reported: 0,
        storage: Storage::Windows(CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: null_mut(),
        }),
    };
    if let Storage::Windows(blob) = &mut output.storage {
        // SAFETY: borrowed inputs live through this synchronous call. DPAPI alone
        // writes the output allocation; no injected raw pointers. Null description,
        // prompt and reserved; no LOCAL_MACHINE flag or interactive fallback.
        output.success = unsafe {
            (match operation {
                Operation::Protect => {
                    CryptProtectData(&input, null(), &entropy, null(), null(), FLAGS, blob)
                }
                Operation::Unprotect => {
                    CryptUnprotectData(&input, null_mut(), &entropy, null(), null(), FLAGS, blob)
                }
            }) != 0
        };
        output.reported = blob.cbData as usize;
    }
    finish(
        output,
        if operation == Operation::Protect {
            MAX_CIPHERTEXT
        } else {
            RECORD
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn context() -> EnvelopeContext {
        EnvelopeContext {
            database_id: [1; 16],
            generation_id: [2; 16],
        }
    }
    fn fixture() -> (DataKey, super::super::EnvelopeBytes) {
        super::super::create(&context(), "password", "recovery").unwrap()
    }
    fn denied<T>(result: Result<T>, expected: RememberedKeyError) {
        assert!(matches!(result, Err(error) if error == expected));
    }
    fn output(
        bytes: &[u8],
        success: bool,
        reported: usize,
    ) -> (Output, std::rc::Rc<std::cell::Cell<bool>>) {
        let released = std::rc::Rc::new(std::cell::Cell::new(false));
        (
            Output {
                success,
                reported,
                storage: Storage::Test {
                    bytes: bytes.into(),
                    released: released.clone(),
                },
            },
            released,
        )
    }
    #[test]
    fn adapter_preserves_key_and_canonical_entropy_on_repeated_protect() {
        let (key, envelope) = fixture();
        assert_eq!(PREFIX, 61);
        assert_eq!(RECORD, 125);
        let expected_entropy = [
            b"com.velay.app/remembered-key\x01".as_slice(),
            &[1; 16],
            &[2; 16],
        ]
        .concat();
        assert!(binding(&context()).as_slice() == expected_entropy);
        for secret in [
            super::super::UnlockSecret::Password("password"),
            super::super::UnlockSecret::Recovery("recovery"),
        ] {
            let unlocked = super::super::unlock(envelope.as_bytes(), &context(), secret).unwrap();
            for _ in 0..2 {
                let protected = protect_with(&unlocked, &context(), |op, input, entropy| {
                    assert_eq!(op, Operation::Protect);
                    assert!(entropy == binding(&context()).as_slice());
                    assert!(input == record(&key, &context()).as_slice());
                    Ok(Zeroizing::new(vec![7]))
                })
                .unwrap();
                let opened =
                    unprotect_with(protected.as_bytes(), &context(), |op, input, entropy| {
                        assert_eq!(op, Operation::Unprotect);
                        assert_eq!(input, &[7]);
                        assert!(entropy == binding(&context()).as_slice());
                        Ok(record(&key, &context()))
                    })
                    .unwrap();
                assert!(key.0.as_ref() == opened.0.as_ref());
                assert!(opened.1 == context());
            }
        }
    }
    #[test]
    fn wrong_provenance_and_ciphertext_bounds_never_call_native() {
        let (key, _) = fixture();
        for generation in [false, true] {
            let mut other = context();
            if generation {
                other.generation_id[0] ^= 1;
            } else {
                other.database_id[0] ^= 1;
            }
            denied(
                protect_with(&key, &other, |_, _, _| panic!("native called")),
                RememberedKeyError::ContextMismatch,
            );
            denied(
                unprotect_with(&[1], &other, |_, _, _| Ok(record(&key, &context()))),
                RememberedKeyError::ContextMismatch,
            );
        }
        for bytes in [vec![], vec![1; MAX_CIPHERTEXT + 1]] {
            denied(
                unprotect_with(&bytes, &context(), |_, _, _| panic!("native called")),
                RememberedKeyError::Malformed,
            );
        }
        let opened = unprotect_with(&vec![1; MAX_CIPHERTEXT], &context(), |_, _, _| {
            Ok(record(&key, &context()))
        })
        .unwrap();
        assert!(key.0.as_ref() == opened.0.as_ref());
    }
    #[test]
    fn successful_native_plaintext_requires_exact_framing_and_checksum() {
        let (key, _) = fixture();
        for length in [0, RECORD - 1, RECORD + 1] {
            denied(
                unprotect_with(&[1], &context(), |_, _, _| {
                    Ok(Zeroizing::new(vec![0; length]))
                }),
                RememberedKeyError::Malformed,
            );
        }
        for (offset, expected) in [
            (0, RememberedKeyError::Malformed),
            (DOMAIN.len(), RememberedKeyError::UnsupportedVersion),
            (DOMAIN.len() + 1, RememberedKeyError::ContextMismatch),
            (DOMAIN.len() + 17, RememberedKeyError::ContextMismatch),
            (PREFIX, RememberedKeyError::Malformed),
            (RECORD - 1, RememberedKeyError::Malformed),
        ] {
            let mut changed = record(&key, &context());
            changed[offset] ^= 1;
            denied(
                unprotect_with(&[1], &context(), |_, _, _| Ok(changed)),
                expected,
            );
        }
    }
    #[test]
    fn native_output_is_bounded_and_wiped_even_on_failure_or_bad_reports() {
        for (success, actual, reported, expected) in [
            (false, 5, 5, RememberedKeyError::NativeFailure),
            (true, 5, 0, RememberedKeyError::Malformed),
            (true, 5, 6, RememberedKeyError::Malformed),
            (
                true,
                MAX_CIPHERTEXT + 1,
                MAX_CIPHERTEXT + 1,
                RememberedKeyError::Malformed,
            ),
        ] {
            let (owned, released) = output(&vec![42; actual], success, reported);
            denied(finish(owned, MAX_CIPHERTEXT), expected);
            assert!(released.get());
        }
        for success in [false, true] {
            denied(
                finish(
                    Output {
                        success,
                        reported: 5,
                        storage: Storage::Empty,
                    },
                    MAX_CIPHERTEXT,
                ),
                if success {
                    RememberedKeyError::Malformed
                } else {
                    RememberedKeyError::NativeFailure
                },
            );
        }
        let (owned, released) = output(&[42; 5], true, 5);
        let copied = finish(owned, MAX_CIPHERTEXT).unwrap();
        assert!(copied.as_slice() == [42; 5]);
        assert!(released.get());
    }
    #[test]
    fn native_errors_and_malformed_protect_outputs_do_not_escape() {
        let (key, _) = fixture();
        denied(
            protect_with(&key, &context(), |_, _, _| {
                Err(RememberedKeyError::NativeFailure)
            }),
            RememberedKeyError::NativeFailure,
        );
        denied(
            unprotect_with(&[1], &context(), |_, _, _| {
                Err(RememberedKeyError::NativeFailure)
            }),
            RememberedKeyError::NativeFailure,
        );
        for size in [0, MAX_CIPHERTEXT + 1] {
            denied(
                protect_with(&key, &context(), |_, _, _| {
                    Ok(Zeroizing::new(vec![0; size]))
                }),
                RememberedKeyError::Malformed,
            );
        }
    }
    #[cfg(windows)]
    #[test]
    fn windows_real_local_allocations_are_wiped_and_freed_on_all_paths() {
        use windows_sys::Win32::Security::Cryptography::CRYPT_INTEGER_BLOB;
        #[link(name = "kernel32")]
        unsafe extern "system" {
            fn LocalAlloc(flags: u32, bytes: usize) -> *mut core::ffi::c_void;
        }
        for (success, reported) in [(false, 5), (true, 0), (true, MAX_CIPHERTEXT + 1), (true, 5)] {
            // SAFETY: real fixed LocalAlloc allocation, never a fabricated pointer.
            let pointer = unsafe { LocalAlloc(0, 5) }.cast::<u8>();
            assert!(!pointer.is_null());
            let actual = unsafe { LocalSize(pointer.cast()) };
            assert!(actual >= 5);
            let owned = Output {
                success,
                reported,
                storage: Storage::Windows(CRYPT_INTEGER_BLOB {
                    cbData: reported as u32,
                    pbData: pointer,
                }),
            };
            unsafe {
                std::slice::from_raw_parts_mut(pointer, actual).fill(42);
            }
            CLEANUP.with(|observed| observed.set((0, false, false)));
            let result = finish(owned, MAX_CIPHERTEXT);
            assert_eq!(result.is_ok(), success && reported == 5);
            CLEANUP.with(|observed| assert_eq!(observed.get(), (actual, true, true)));
        }
        for success in [false, true] {
            let owned = Output {
                success,
                reported: 5,
                storage: Storage::Windows(CRYPT_INTEGER_BLOB {
                    cbData: 5,
                    pbData: std::ptr::null_mut(),
                }),
            };
            assert!(finish(owned, MAX_CIPHERTEXT).is_err());
        }
    }
    #[cfg(windows)]
    #[test]
    fn windows_current_user_roundtrip_matches_both_unlock_roles() {
        use windows_sys::Win32::Security::Cryptography::{
            CRYPTPROTECT_LOCAL_MACHINE, CRYPTPROTECT_UI_FORBIDDEN,
        };
        assert_eq!(FLAGS, CRYPTPROTECT_UI_FORBIDDEN);
        assert_eq!(FLAGS & CRYPTPROTECT_LOCAL_MACHINE, 0);
        let (key, envelope) = fixture();
        for secret in [
            super::super::UnlockSecret::Password("password"),
            super::super::UnlockSecret::Recovery("recovery"),
        ] {
            let unlocked = super::super::unlock(envelope.as_bytes(), &context(), secret).unwrap();
            for _ in 0..2 {
                let cache = protect(&unlocked, &context()).unwrap();
                let opened = unprotect(cache.as_bytes(), &context()).unwrap();
                assert!(key.0.as_ref() == opened.0.as_ref());
                for generation in [false, true] {
                    let mut other = context();
                    if generation {
                        other.generation_id[0] ^= 1;
                    } else {
                        other.database_id[0] ^= 1;
                    }
                    denied(
                        protect(&unlocked, &other),
                        RememberedKeyError::ContextMismatch,
                    );
                    assert!(unprotect(cache.as_bytes(), &other).is_err());
                }
            }
        }
    }
    #[cfg(windows)]
    #[test]
    fn windows_rejects_corrupt_ciphertext_and_successfully_protected_bad_records() {
        let (key, _) = fixture();
        let cache = protect(&key, &context()).unwrap();
        for bytes in [
            &[][..],
            &cache.as_bytes()[..cache.as_bytes().len() - 1],
            &vec![0; MAX_CIPHERTEXT + 1],
        ] {
            assert!(unprotect(bytes, &context()).is_err());
        }
        let mut changed = cache.as_bytes().to_vec();
        let last = changed.len() - 1;
        changed[last] ^= 1;
        assert!(unprotect(&changed, &context()).is_err());
        for offset in [
            0,
            DOMAIN.len(),
            DOMAIN.len() + 1,
            DOMAIN.len() + 17,
            PREFIX,
            RECORD - 1,
        ] {
            let mut bad = record(&key, &context());
            bad[offset] ^= 1;
            let protected = native(Operation::Protect, &bad, &binding(&context())).unwrap();
            assert!(unprotect(&protected, &context()).is_err());
        }
        for size in [0, RECORD - 1, RECORD + 1] {
            let bad = Zeroizing::new(vec![42; size]);
            let protected = native(Operation::Protect, &bad, &binding(&context())).unwrap();
            assert!(unprotect(&protected, &context()).is_err());
        }
    }
    #[cfg(not(windows))]
    #[test]
    fn non_windows_is_explicitly_unavailable() {
        let (key, _) = fixture();
        denied(protect(&key, &context()), RememberedKeyError::Unavailable);
        denied(unprotect(&[1], &context()), RememberedKeyError::Unavailable);
    }
}
