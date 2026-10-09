//! Application-owned storage identity; no legacy family adoption.
pub const APPLICATION_ID: &str = "com.velay.app";
pub const DATABASE_FILENAME: &str = "velay.sqlite3";
/// SQLite family discriminator: ASCII `VLAY`, not an authenticity signature.
pub const SQLITE_APPLICATION_ID: i64 = 0x564C4159;
