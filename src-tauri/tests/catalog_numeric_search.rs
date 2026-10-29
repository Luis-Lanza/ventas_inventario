use repuestos_autos::application::catalog::{self, BrowseProductsInput, ProductActivityFilter, ProductStockFilter};
use repuestos_autos::catalog::open_seeded_catalog;
use repuestos_autos::infrastructure::sqlite::SqliteCatalogRepository;
use rusqlite::params;

fn assert_matches(connection: &rusqlite::Connection, query: &str, expected: &[&str]) {
    let changes = connection.total_changes();
    let products = catalog::search_active_products(connection, query).unwrap();
    assert_eq!(products.iter().map(|p| p.sku.as_str()).collect::<Vec<_>>(), expected, "catalog {query}");
    let products = catalog::search_active_sale_products(connection, query).unwrap();
    assert_eq!(products.iter().map(|p| p.sku.as_str()).collect::<Vec<_>>(), expected, "sales {query}");
    for page in 1..=expected.len() as i64 + 1 {
        let input = BrowseProductsInput { query: Some(query.into()), category_id: None, stock_filter: ProductStockFilter::All, activity_filter: ProductActivityFilter::Active, page, page_size: 1 };
        let expected_page = expected.get((page - 1) as usize).copied().into_iter().collect::<Vec<_>>();
        let catalog = catalog::browse_active_products(connection, &SqliteCatalogRepository, &input).unwrap();
        assert_eq!((catalog.total, catalog.total_pages), (expected.len() as i64, expected.len() as i64), "{query}");
        assert_eq!(catalog.products.iter().map(|p| p.sku.as_str()).collect::<Vec<_>>(), expected_page);
        let inventory = catalog::browse_active_inventory_products(connection, &input).unwrap();
        assert_eq!((inventory.total, inventory.total_pages), (catalog.total, catalog.total_pages));
        assert_eq!(inventory.products.iter().map(|p| p.sku.as_str()).collect::<Vec<_>>(), expected_page);
        let sales = catalog::browse_active_sale_products(connection, &input).unwrap();
        assert_eq!((sales.total, sales.total_pages), (catalog.total, catalog.total_pages));
        assert_eq!(sales.products.iter().map(|p| p.sku.as_str()).collect::<Vec<_>>(), expected_page);
    }
    assert_eq!(connection.total_changes(), changes, "search is read-only");
}

#[test]
fn compound_sku_queries_keep_their_existing_prefix_matches() {
    let connection = open_seeded_catalog().unwrap();
    connection.execute("INSERT INTO products (category_id, sku, name, active, list_price_centavos, minimum_unit_price_centavos) VALUES (1, 'FLT-0010', 'Zulu filter', 1, 2500, 2500)", []).unwrap();
    let id = connection.last_insert_rowid();
    connection.execute("INSERT INTO stock_balances (product_id, quantity) VALUES (?1, 1)", [id]).unwrap();
    connection.execute("INSERT INTO catalog_product_search (rowid, product_id, content) VALUES (?1, ?1, 'flt-0010 zulu filter')", [id]).unwrap();
    assert_matches(&connection, "FLT-001", &["FLT-001", "FLT-0010"]);
    assert_matches(&connection, "filt", &["FLT-001", "FLT-0010"]);
}

#[test]
fn numeric_values_are_exact_across_search_and_browse_without_losing_word_prefixes() {
    let connection = open_seeded_catalog().unwrap();
    connection.execute("INSERT INTO attribute_definitions (id, category_id, label, field_type, required) VALUES (9000, 1, 'Capacity', 'text', 0)", []).unwrap();
    for (index, value) in ["10", "10.0", "100", "10.5", "model 10"].iter().enumerate() {
        connection.execute("INSERT INTO products (category_id, sku, name, active, list_price_centavos, minimum_unit_price_centavos) VALUES (1, ?1, ?2, 1, 2500, 2500)", params![format!("EXACT-{index}"), format!("Numeric fixture {index}")]).unwrap();
        let id = connection.last_insert_rowid();
        connection.execute("INSERT INTO stock_balances (product_id, quantity) VALUES (?1, 1)", [id]).unwrap();
        connection.execute("INSERT INTO catalog_product_search (rowid, product_id, content) VALUES (?1, ?1, ?2)", params![id, format!("numeric fixture capacity {value}")]).unwrap();
        connection.execute("INSERT INTO product_attribute_values (product_id, definition_id, text_value, searchable_value) VALUES (?1, 9000, ?2, ?2)", params![id, value]).unwrap();
    }
    for query in ["10", "10.0", "cap 10", "cap 10.0", "+1e1", "1.0e+1"] {
        assert_matches(&connection, query, &["EXACT-0", "EXACT-1"]);
    }
    assert_matches(&connection, "capac", &["EXACT-0", "EXACT-1", "EXACT-2", "EXACT-3", "EXACT-4"]);
}

#[test]
fn repeated_measures_require_distinct_rows_not_sku_name_or_category_terms() {
    let mut connection = open_seeded_catalog().unwrap();
    let category = catalog::create_category(&mut connection, catalog::CreateCategoryInput {
        name: "Measures 28 58".into(),
        fields: vec![("Outside", "number"), ("Inside", "text"), ("Height", "option")].into_iter().map(|(label, field_type)| catalog::CategoryFieldInput {
            label: label.into(), field_type: field_type.into(), required: false,
            options: if field_type == "option" { vec!["28".into(), "58".into()] } else { vec![] },
        }).collect(),
    }).unwrap();
    for (sku, name, values) in [
        ("A", "A complete", vec!["28", "28.0", "58"]),
        ("B", "B reordered", vec!["58", "28", "28"]),
        ("28", "C missing 28 58", vec!["28", "", "58"]),
        ("28 28 58", "D exact SKU", vec![]),
        ("E", "E mixed", vec!["28", "model 28", "58"]),
    ] {
        catalog::create_product(&mut connection, catalog::CreateProductInput {
            sku: sku.into(), name: name.into(), category_id: category.category_id,
            purchase_price_centavos: None, sale_price_centavos: 2500, minimum_sale_price_centavos: 2500,
            low_stock_threshold: None, opening_quantity: 1,
            attribute_values: values.into_iter().enumerate().filter(|(_, value)| !value.is_empty()).map(|(index, value)| catalog::AttributeValueInput {
                definition_id: category.fields[index].definition_id, value: value.into(),
            }).collect(),
        }).unwrap();
    }
    assert_matches(&connection, "28 28 58", &["A", "B", "28 28 58"]);
    assert_matches(&connection, "58 28 28", &["A", "B"]);
    assert_matches(&connection, "28 58", &["A", "B", "28", "E"]);
    assert_matches(&connection, "28", &["A", "B", "28", "28 28 58", "E"]);
    assert_matches(&connection, "50", &[]);
}
