use rusqlite::{functions::FunctionFlags, Connection, Result};

// Counts source rows, not flattened FTS occurrences, before LIMIT or pagination.
pub(super) const CATALOG_SEARCH_CLAUSE: &str = r#"
(
    lower(p.sku) = lower(json_extract(?1, '$.original'))
    OR (json_array_length(?1, '$.numbers') = 1
        AND json_extract(?1, '$.fts') = ''
        AND catalog_sku_prefix(p.sku, json_extract(?1, '$.original')))
    OR (
        (json_extract(?1, '$.fts') = '' OR search.rowid IN (
            SELECT rowid FROM catalog_product_search
            WHERE content MATCH json_extract(?1, '$.fts')
        ))
        AND NOT EXISTS (
            SELECT 1 FROM json_each(?1, '$.numbers') number
            GROUP BY number.value
            HAVING count(*) > (
                SELECT count(*) FROM product_attribute_values v
                WHERE v.product_id = p.id
                  AND catalog_number(v.searchable_value) = number.value
            )
        )
    )
)
"#;

fn number(value: &str) -> Option<f64> {
    let value = value.trim();
    // Rust's whole-string parser accepts signed decimal/exponent syntax. Restrict
    // the alphabet and require finiteness so NaN/inf and units cannot be measures.
    if !value.bytes().all(|c| c.is_ascii_digit() || b"+-.eE".contains(&c)) {
        return None;
    }
    value.parse::<f64>().ok().filter(|value| value.is_finite())
}

fn tokens(value: &str) -> impl Iterator<Item = &str> {
    value.split(|c: char| !c.is_alphanumeric()).filter(|term| !term.is_empty())
}

pub(super) fn register(connection: &Connection) -> Result<()> {
    let flags = FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC;
    connection.create_scalar_function("catalog_number", 1, flags, |context| {
        Ok(number(context.get_raw(0).as_str()?))
    })?;
    connection.create_scalar_function("catalog_sku_prefix", 2, flags, |context| {
        let sku = context.get::<String>(0)?.to_lowercase();
        let query = context.get::<String>(1)?.to_lowercase();
        let matches = tokens(&query).all(|term| tokens(&sku).any(|part| part.starts_with(term)));
        Ok(matches)
    })
}

pub(super) fn normalized_search_query(query: &str) -> Option<String> {
    let mut words = Vec::new();
    let mut numbers = Vec::new();
    for chunk in query.split_whitespace() {
        if let Some(value) = number(chunk) {
            numbers.push(value);
        } else {
            words.extend(tokens(chunk).map(|term| format!("\"{}\"*", term.to_lowercase())));
        }
    }
    (!words.is_empty() || !numbers.is_empty()).then(|| serde_json::json!({
        "original": query.trim(), "fts": words.join(" "), "numbers": numbers,
    }).to_string())
}
