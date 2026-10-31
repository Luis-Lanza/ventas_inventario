//! Read-only structural inspection; see docs/ENCRYPTED_STORAGE_GENERATIONS.md.
#![allow(dead_code)] // Inert until keyed admission is implemented.
use crate::infrastructure::key_envelope::{self, EnvelopeContext};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
};
const CURRENT: &str = "current.bin";
const DATABASE: &str = "data.sqlite3";
const ENVELOPE: &str = "key-envelope.bin";
const MAGIC: &[u8; 16] = b"VELAY-GEN-SELECT";
const LENGTH: usize = 113;
const ENTRY_CAP: usize = 128;
pub(crate) enum Inspection {
    Empty,
    Selected(Selection),
}
pub(crate) struct Selection {
    context: EnvelopeContext,
    database: PathBuf,
    envelope: PathBuf,
}
impl Selection {
    pub(crate) fn context(&self) -> &EnvelopeContext {
        &self.context
    }
    pub(crate) fn database_path(&self) -> &Path {
        &self.database
    }
    pub(crate) fn envelope_path(&self) -> &Path {
        &self.envelope
    }
}
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Blocked;
type Result<T> = std::result::Result<T, Blocked>;
/// Inspect a dedicated absolute root without writes. Selection is not authentication.
/// Caller must exclude cooperative writers; adversarial namespace races are not covered.
pub(crate) fn inspect(root: &Path) -> Result<Inspection> {
    if !root.is_absolute()
        || root
            .as_os_str()
            .as_encoded_bytes()
            .split(|b| *b == b'/' || (cfg!(windows) && *b == b'\\'))
            .any(|part| part == b"." || part == b"..")
    {
        return Err(Blocked);
    }
    for ancestor in root.ancestors() {
        directory(ancestor)?;
    }
    let mut count = 0;
    for entry in fs::read_dir(root).map_err(|_| Blocked)? {
        let entry = entry.map_err(|_| Blocked)?;
        count += 1;
        if count > ENTRY_CAP {
            return Err(Blocked);
        }
        if entry.file_name() == CURRENT {
            regular(&entry.path())?;
        } else {
            parse_id(&entry.file_name().to_string_lossy())?;
            directory(&entry.path())?;
        }
    }
    if count == 0 {
        return Ok(Inspection::Empty);
    }
    let bytes = bounded_read(&root.join(CURRENT), LENGTH)?;
    if &bytes[..16] != MAGIC || bytes[16] != 1 || Sha256::digest(&bytes[..81])[..] != bytes[81..] {
        return Err(Blocked);
    }
    let context = EnvelopeContext {
        database_id: bytes[17..33].try_into().map_err(|_| Blocked)?,
        generation_id: bytes[33..49].try_into().map_err(|_| Blocked)?,
    };
    let selected_name = generation_name(&context.generation_id);
    // Retained generations are checked as artifacts, never considered selection candidates.
    let mut found = false;
    for (index, entry) in fs::read_dir(root).map_err(|_| Blocked)?.enumerate() {
        if index >= ENTRY_CAP {
            return Err(Blocked);
        }
        let entry = entry.map_err(|_| Blocked)?;
        if entry.file_name() == CURRENT {
            continue;
        }
        let name = entry.file_name();
        let id = parse_id(&name.to_string_lossy())?;
        let retained_context = EnvelopeContext {
            database_id: context.database_id,
            generation_id: id,
        };
        let envelope = inspect_generation(&entry.path(), &retained_context)?;
        if name == selected_name.as_str() {
            if Sha256::digest(&envelope)[..] != bytes[49..81] {
                return Err(Blocked);
            }
            found = true;
        }
    }
    if !found {
        return Err(Blocked);
    }
    let dir = root.join(selected_name);
    Ok(Inspection::Selected(Selection {
        context,
        database: dir.join(DATABASE),
        envelope: dir.join(ENVELOPE),
    }))
}
fn inspect_generation(dir: &Path, context: &EnvelopeContext) -> Result<Vec<u8>> {
    directory(dir)?;
    let mut count = 0;
    for entry in fs::read_dir(dir).map_err(|_| Blocked)? {
        let entry = entry.map_err(|_| Blocked)?;
        count += 1;
        if count > 2 || (entry.file_name() != DATABASE && entry.file_name() != ENVELOPE) {
            return Err(Blocked);
        }
        regular(&entry.path())?;
    }
    if count != 2 || regular(&dir.join(DATABASE))?.len() == 0 {
        return Err(Blocked);
    }
    let envelope = bounded_read(&dir.join(ENVELOPE), key_envelope::ENCODED_LENGTH)?;
    key_envelope::validate_framing(&envelope, context).map_err(|_| Blocked)?;
    Ok(envelope)
}
fn metadata(path: &Path) -> Result<fs::Metadata> {
    let meta = fs::symlink_metadata(path).map_err(|_| Blocked)?;
    if meta.is_symlink() {
        return Err(Blocked);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return Err(Blocked);
        }
    }
    Ok(meta)
}
fn directory(path: &Path) -> Result<()> {
    if !metadata(path)?.is_dir() {
        return Err(Blocked);
    }
    Ok(())
}
fn regular(path: &Path) -> Result<fs::Metadata> {
    let meta = metadata(path)?;
    if !meta.is_file() {
        return Err(Blocked);
    }
    Ok(meta)
}
fn bounded_read(path: &Path, length: usize) -> Result<Vec<u8>> {
    use std::io::Read;
    if regular(path)?.len() != length as u64 {
        return Err(Blocked);
    }
    let file = fs::File::open(path).map_err(|_| Blocked)?;
    if !file.metadata().map_err(|_| Blocked)?.is_file() {
        return Err(Blocked);
    }
    let mut bytes = Vec::with_capacity(length + 1);
    file.take((length + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| Blocked)?;
    if bytes.len() != length {
        return Err(Blocked);
    }
    Ok(bytes)
}
fn parse_id(name: &str) -> Result<[u8; 16]> {
    if name.len() != 32
        || !name
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(Blocked);
    }
    let mut id = [0; 16];
    for (index, byte) in id.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&name[index * 2..index * 2 + 2], 16).map_err(|_| Blocked)?;
    }
    Ok(id)
}
fn generation_name(id: &[u8; 16]) -> String {
    id.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::OnceLock;
    use tempfile::{tempdir, TempDir};
    fn context() -> EnvelopeContext {
        EnvelopeContext {
            database_id: [1; 16],
            generation_id: [2; 16],
        }
    }
    fn envelope() -> &'static [u8] {
        static BYTES: OnceLock<Vec<u8>> = OnceLock::new();
        BYTES.get_or_init(|| {
            key_envelope::create(&context(), "password", "recovery")
                .unwrap()
                .1
                .as_bytes()
                .to_vec()
        })
    }
    fn selector(bytes: &[u8], ctx: EnvelopeContext) -> Vec<u8> {
        let mut record = Vec::from(MAGIC.as_slice());
        record.push(1);
        record.extend(ctx.database_id);
        record.extend(ctx.generation_id);
        record.extend(Sha256::digest(bytes));
        record.extend(Sha256::digest(&record));
        assert_eq!(record.len(), LENGTH);
        record
    }
    fn fixture() -> TempDir {
        let root = tempdir().unwrap();
        let dir = root.path().join(generation_name(&context().generation_id));
        fs::create_dir(&dir).unwrap();
        fs::write(dir.join(DATABASE), b"opaque synthetic database").unwrap();
        fs::write(dir.join(ENVELOPE), envelope()).unwrap();
        fs::write(root.path().join(CURRENT), selector(envelope(), context())).unwrap();
        root
    }
    // Snapshot fixture entries, kinds and bytes without following links.
    fn snapshot(root: &Path) -> Vec<(PathBuf, Vec<u8>)> {
        fn walk(path: &Path, out: &mut Vec<(PathBuf, Vec<u8>)>) {
            let meta = fs::symlink_metadata(path).unwrap();
            let bytes = if meta.is_symlink() {
                fs::read_link(path)
                    .unwrap()
                    .as_os_str()
                    .as_encoded_bytes()
                    .to_vec()
            } else if meta.is_file() {
                fs::read(path).unwrap()
            } else {
                vec![]
            };
            out.push((path.to_owned(), bytes));
            if meta.is_dir() && !meta.is_symlink() {
                for entry in fs::read_dir(path).unwrap() {
                    walk(&entry.unwrap().path(), out);
                }
            }
        }
        let mut out = vec![];
        walk(root, &mut out);
        out.sort();
        out
    }
    fn blocked_unchanged(root: &Path) {
        let before = snapshot(root);
        assert!(matches!(inspect(root), Err(Blocked)));
        assert_eq!(snapshot(root), before);
        assert_eq!(format!("{Blocked:?}"), "Blocked");
    }
    #[test]
    fn only_existing_empty_root_is_empty() {
        let root = tempdir().unwrap();
        assert!(matches!(inspect(root.path()), Ok(Inspection::Empty)));
        assert!(matches!(inspect(&root.path().join("absent")), Err(Blocked)));
        assert!(matches!(inspect(Path::new("relative")), Err(Blocked)));
        blocked_unchanged(&root.path().join("."));
        blocked_unchanged(
            &root
                .path()
                .join("..")
                .join(root.path().file_name().unwrap()),
        );
    }
    #[test]
    fn valid_selection_survives_database_mutation_and_retained_generation() {
        let root = fixture();
        let Inspection::Selected(selected) = inspect(root.path()).unwrap() else {
            panic!("not selected")
        };
        assert!(selected.context() == &context());
        assert_eq!(
            selected.envelope_path(),
            root.path()
                .join(generation_name(&context().generation_id))
                .join(ENVELOPE)
        );
        fs::write(
            selected.database_path(),
            b"legitimate changed opaque contents",
        )
        .unwrap();
        let mut retained = context();
        retained.generation_id = [255; 16];
        let bytes = key_envelope::create(&retained, "password", "recovery")
            .unwrap()
            .1;
        let dir = root.path().join(generation_name(&retained.generation_id));
        fs::create_dir(&dir).unwrap();
        fs::write(dir.join(DATABASE), b"retained").unwrap();
        fs::write(dir.join(ENVELOPE), bytes.as_bytes()).unwrap();
        let before = snapshot(root.path());
        let Inspection::Selected(again) = inspect(root.path()).unwrap() else {
            panic!("not selected")
        };
        assert!(again.context() == &context());
        assert_eq!(snapshot(root.path()), before);
        fs::write(root.path().join(CURRENT), b"corrupt").unwrap();
        blocked_unchanged(root.path());
    }
    #[test]
    fn selector_damage_is_bounded_and_never_promotes_other_artifacts() {
        let original = selector(envelope(), context());
        let mut cases = vec![
            vec![],
            original[..112].to_vec(),
            [original.as_slice(), &[0]].concat(),
            vec![0; 1_000_000],
        ];
        for offset in [0, 16, 17, 49, 81] {
            let mut b = original.clone();
            b[offset] ^= 1;
            cases.push(b);
        }
        // Independently exercise magic/version rejection, not just checksum failure.
        for offset in [0, 16] {
            let mut bytes = original.clone();
            bytes[offset] ^= 1;
            let digest = Sha256::digest(&bytes[..81]);
            bytes[81..].copy_from_slice(&digest);
            cases.push(bytes);
        }
        for bytes in cases {
            let root = fixture();
            fs::write(root.path().join(CURRENT), bytes).unwrap();
            blocked_unchanged(root.path());
        }
    }
    #[test]
    fn envelope_damage_even_with_recomputed_selector_blocks() {
        let mut cases = vec![
            vec![],
            envelope()[..218].to_vec(),
            [envelope(), &[0]].concat(),
            vec![0; 1_000_000],
        ];
        for offset in [0, 8, 9, 10, 11, 27] {
            let mut b = envelope().to_vec();
            b[offset] ^= 127;
            cases.push(b);
        }
        for bytes in cases {
            let root = fixture();
            fs::write(
                root.path()
                    .join(generation_name(&context().generation_id))
                    .join(ENVELOPE),
                &bytes,
            )
            .unwrap();
            fs::write(root.path().join(CURRENT), selector(&bytes, context())).unwrap();
            blocked_unchanged(root.path());
        }
        let root = fixture();
        let mut bytes = envelope().to_vec();
        bytes[100] ^= 1;
        fs::write(
            root.path()
                .join(generation_name(&context().generation_id))
                .join(ENVELOPE),
            bytes,
        )
        .unwrap();
        blocked_unchanged(root.path());
    }
    #[test]
    fn incomplete_unselected_unknown_and_temporary_layouts_block() {
        for name in [
            "current.tmp",
            "initializing",
            "data.sqlite3",
            "ABCDEF",
            "../ignored",
        ] {
            if name.contains('/') {
                continue;
            }
            let root = tempdir().unwrap();
            fs::write(root.path().join(name), b"evidence").unwrap();
            blocked_unchanged(root.path());
        }
        for missing in [CURRENT, DATABASE, ENVELOPE] {
            let root = tempdir().unwrap();
            let dir = root.path().join(generation_name(&context().generation_id));
            fs::create_dir(&dir).unwrap();
            if missing != CURRENT {
                fs::write(root.path().join(CURRENT), selector(envelope(), context())).unwrap();
            }
            if missing != DATABASE {
                fs::write(dir.join(DATABASE), b"opaque").unwrap();
            }
            if missing != ENVELOPE {
                fs::write(dir.join(ENVELOPE), envelope()).unwrap();
            }
            blocked_unchanged(root.path());
        }
        for artifact in [DATABASE, ENVELOPE] {
            let root = tempdir().unwrap();
            let dir = root.path().join(generation_name(&context().generation_id));
            fs::create_dir(&dir).unwrap();
            fs::write(root.path().join(CURRENT), selector(envelope(), context())).unwrap();
            for name in [DATABASE, ENVELOPE] {
                if name == artifact {
                    fs::create_dir(dir.join(name)).unwrap();
                } else {
                    fs::write(dir.join(name), envelope()).unwrap();
                }
            }
            blocked_unchanged(root.path());
        }
        let root = fixture();
        fs::write(
            root.path()
                .join(generation_name(&context().generation_id))
                .join(DATABASE),
            [],
        )
        .unwrap();
        blocked_unchanged(root.path());
        let root = fixture();
        fs::write(
            root.path()
                .join(generation_name(&context().generation_id))
                .join("extra"),
            [],
        )
        .unwrap();
        blocked_unchanged(root.path());
        let root = fixture();
        fs::write(root.path().join("current.tmp"), []).unwrap();
        blocked_unchanged(root.path());
        let root = fixture();
        let mut ctx = context();
        ctx.generation_id = [3; 16];
        fs::write(root.path().join(CURRENT), selector(envelope(), ctx)).unwrap();
        blocked_unchanged(root.path());
    }
    #[test]
    fn unreasonable_entry_count_blocks() {
        let root = fixture();
        for i in 0..ENTRY_CAP {
            fs::create_dir(root.path().join(format!("{i:032x}"))).unwrap();
        }
        blocked_unchanged(root.path());
    }
    #[cfg(windows)]
    #[test]
    fn windows_junction_root_ancestor_and_generation_block() {
        use std::{os::windows::fs::MetadataExt, process::Command};
        fn junction(parent: &Path, name: &str, target: &str) -> PathBuf {
            // Only fixed names or generated hex IDs enter cmd; paths stay in cwd.
            assert!(name.bytes().all(|b| b.is_ascii_alphanumeric()));
            assert_eq!(target, "target");
            let output = Command::new("cmd.exe")
                .args(["/d", "/c", "mklink", "/J", name, target])
                .current_dir(parent)
                .output()
                .expect("run mklink for synthetic junction fixture");
            assert!(
                output.status.success(),
                "junction creation failed: {output:?}"
            );
            let link = parent.join(name);
            assert_ne!(
                fs::symlink_metadata(&link).unwrap().file_attributes() & 0x400,
                0
            );
            link
        }
        let outer = tempdir().unwrap();
        let target = outer.path().join("target");
        fs::create_dir(&target).unwrap();
        let link = junction(outer.path(), "junction", "target");
        assert!(matches!(inspect(&target), Ok(Inspection::Empty)));
        assert!(matches!(inspect(&link), Err(Blocked)));
        fs::create_dir(target.join("child")).unwrap();
        assert!(matches!(
            inspect(&target.join("child")),
            Ok(Inspection::Empty)
        ));
        assert!(matches!(inspect(&link.join("child")), Err(Blocked)));
        // Remove only the link; verify the target survived inspection and removal.
        fs::remove_dir(&link).unwrap();
        assert!(target.join("child").is_dir());

        let root = fixture();
        let name = generation_name(&context().generation_id);
        let holder = tempdir().unwrap();
        let target = holder.path().join("target");
        fs::rename(root.path().join(&name), &target).unwrap();
        let before = snapshot(&target);
        // Keep the target outside the inspected root: an unknown target entry
        // must not mask a missing junction check. Junction targets are absolute.
        let generation = junction(holder.path(), &name, "target");
        fs::rename(&generation, root.path().join(&name)).unwrap();
        assert!(matches!(inspect(root.path()), Err(Blocked)));
        assert_eq!(snapshot(&target), before);
        fs::remove_dir(root.path().join(&name)).unwrap();
        assert_eq!(snapshot(&target), before);
    }
    #[cfg(unix)]
    #[test]
    fn symlink_root_ancestor_generation_and_artifacts_block() {
        use std::os::unix::fs::symlink;
        let outer = tempdir().unwrap();
        let root = fixture();
        symlink(root.path(), outer.path().join("root")).unwrap();
        blocked_unchanged(&outer.path().join("root"));
        symlink(root.path().parent().unwrap(), outer.path().join("ancestor")).unwrap();
        assert!(matches!(
            inspect(
                &outer
                    .path()
                    .join("ancestor")
                    .join(root.path().file_name().unwrap())
            ),
            Err(Blocked)
        ));
        for name in [CURRENT, DATABASE, ENVELOPE, "generation"] {
            let root = tempdir().unwrap();
            let target = fixture();
            let dir = root.path().join(generation_name(&context().generation_id));
            if name == "generation" {
                symlink(
                    target
                        .path()
                        .join(generation_name(&context().generation_id)),
                    &dir,
                )
                .unwrap();
            } else {
                fs::create_dir(&dir).unwrap();
                for artifact in [DATABASE, ENVELOPE] {
                    if artifact == name {
                        symlink(
                            target
                                .path()
                                .join(generation_name(&context().generation_id))
                                .join(artifact),
                            dir.join(artifact),
                        )
                        .unwrap();
                    } else {
                        fs::write(
                            dir.join(artifact),
                            if artifact == DATABASE {
                                b"opaque"
                            } else {
                                envelope()
                            },
                        )
                        .unwrap();
                    }
                }
            }
            if name == CURRENT {
                symlink(target.path().join(CURRENT), root.path().join(CURRENT)).unwrap();
            } else {
                fs::write(root.path().join(CURRENT), selector(envelope(), context())).unwrap();
            }
            blocked_unchanged(root.path());
        }
    }
}
