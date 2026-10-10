import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relative: string) => readFileSync(resolve(root, relative), "utf8");
const readFromHead = (relative: string) => execFileSync("git", ["show", `HEAD:${relative}`], { cwd: root, encoding: "utf8" });
const parseJson = (source: string) => JSON.parse(source) as Record<string, any>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const css = read("src/ui/styles.css");

function assertTicket14PackageAllowlist(
  currentPackage: Record<string, any>,
  baselinePackage: Record<string, any>,
  currentLock: Record<string, any>,
  baselineLock: Record<string, any>,
) {
  assert.equal(currentPackage.scripts["typecheck:tests"], "tsc --project tsconfig.tests.json --noEmit");
  assert.equal(currentPackage.scripts.test, "tsx --test --import ./test/react-dom.ts $(find src \\( -name '*.test.js' -o -name '*.test.ts' \\) ! -path 'src/ui/w9-evidence-audit.test.ts')");
  assert.equal(currentPackage.scripts["test:w9"], "tsx --test src/ui/w9-evidence-audit.test.ts");
  assert.equal(currentPackage.devDependencies["@types/jsdom"], "^30.0.0");

  const comparablePackage = clone(currentPackage);
  const comparableBaselinePackage = clone(baselinePackage);
  for (const script of ["typecheck:tests", "test", "test:w9"]) {
    delete comparablePackage.scripts[script];
    delete comparableBaselinePackage.scripts[script];
  }
  delete comparablePackage.devDependencies["@types/jsdom"];
  delete comparableBaselinePackage.devDependencies["@types/jsdom"];
  assert.deepEqual(comparablePackage, comparableBaselinePackage, "unexpected package.json drift");

  const currentRoot = clone(currentLock.packages[""]);
  const baselineRoot = clone(baselineLock.packages[""]);
  delete currentRoot.devDependencies["@types/jsdom"];
  delete baselineRoot.devDependencies["@types/jsdom"];
  assert.deepEqual(currentRoot, baselineRoot, "unexpected package-lock root drift");

  const allowedLockEntries = new Set([
    "node_modules/@types/jsdom",
    "node_modules/@types/jsdom/node_modules/undici-types",
    "node_modules/@types/tough-cookie",
  ]);
  const packageKeys = new Set([...Object.keys(currentLock.packages), ...Object.keys(baselineLock.packages)]);
  for (const key of packageKeys) {
    if (key === "" || allowedLockEntries.has(key)) continue;
    assert.deepEqual(currentLock.packages[key], baselineLock.packages[key], `unexpected package-lock drift: ${key}`);
  }

  assert.deepEqual(currentLock.packages["node_modules/@types/jsdom"], {
    version: "30.0.0",
    resolved: "https://registry.npmjs.org/@types/jsdom/-/jsdom-30.0.0.tgz",
    integrity: "sha512-uAHGxujGE0cDaKGdK28zgDotFtNA7MKq5DXl8LrfdxdCI8VHcg15oJz+amHTChPNI5JpgEPQWc2xFdrw3em/nQ==",
    dev: true,
    license: "MIT",
    dependencies: {
      "@types/node": "*",
      "@types/tough-cookie": "*",
      "parse5": "^8.0.0",
      "undici-types": "^8.9.0",
    },
  });
  assert.deepEqual(currentLock.packages["node_modules/@types/jsdom/node_modules/undici-types"], {
    version: "8.10.2",
    resolved: "https://registry.npmjs.org/undici-types/-/undici-types-8.10.2.tgz",
    integrity: "sha512-7/+aSjzkUoLc92hV22bTW4aGanXf800zbwguhcICs0OAoCF9wDOE4wkopQ+SqfhXZm8mCK8gHpdTs7pZUWzK3w==",
    dev: true,
    license: "MIT",
  });
  assert.deepEqual(currentLock.packages["node_modules/@types/tough-cookie"], {
    version: "4.0.5",
    resolved: "https://registry.npmjs.org/@types/tough-cookie/-/tough-cookie-4.0.5.tgz",
    integrity: "sha512-/Ad8+nIOV7Rl++6f1BdKxFSMgmoqEoYbHRpPcx3JEfv8VRsQe9Z4mCXeJBzxs7mbHY/XOZZuXlRNfhpVPbs6ZA==",
    dev: true,
    license: "MIT",
  });
}

const ticket11RegistrationMarkers = [
  "command_builder",
  "choose_backup_destination_command",
  "choose_restore_source_command",
  "create_backup_command",
  "prepare_restore_command",
  "confirm_restore_command",
];

const dashboardRegistrationLineAllowlist = new Set([
  "",
  "dashboard_command,",
  "#[cfg(feature = \"desktop\")]",
  "#[tauri::command]",
  "fn dashboard_command(",
  "state: tauri::State<AppState>,",
  "request: commands::dashboard::DashboardRequest,",
  ") -> commands::dashboard::DashboardResponse {",
  "state",
  ".with_read(|connection| Ok(commands::dashboard::dashboard(connection, request)))",
  ".unwrap_or_else(|_| commands::dashboard::DashboardResponse::Error(commands::dashboard::persistence_failure()))",
  "}",
  "#[test]",
  "fn registers_read_only_dashboard_command_at_the_tauri_command_seam() {",
  "let (app, window) = test_window();",
  "let before = app.state::<AppState>().with_read(|connection| Ok(snapshot(connection))).unwrap();",
  "assert!(get_ipc_response(&window, request_with(\"dashboard_command\", serde_json::json!({",
  "\"today_from_utc\": \"2024-03-10T05:00:00Z\",",
  "\"today_to_exclusive_utc\": \"2024-03-11T04:00:00Z\",",
  "\"month_from_utc\": \"2024-03-01T05:00:00Z\",",
  "\"month_to_exclusive_utc\": \"2024-04-01T04:00:00Z\"",
  "}))).is_ok());",
  "assert_eq!(app.state::<AppState>().with_read(|connection| Ok(snapshot(connection))).unwrap(), before);",
]);

// These are complete trimmed lines from the ticket-11 registration/test seam. Keeping
// complete lines (rather than matching marker substrings) prevents appended production
// or test text from riding on an otherwise permitted line.
const ticket11RegistrationLineAllowlist = new Set([
  "use tauri::Manager;",
  "#[cfg(feature = \"desktop\")]",
  "#[tauri::command]",
  "use tauri::{Manager, Runtime};",
  "#[cfg(all(feature = \"desktop\", not(test)))]",
  "#[cfg(all(feature = \"desktop\", test))]",
  "fn command_builder<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {",
  "fn command_builder<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {",
  "sale_history_detail_command",
  "sale_history_detail_command,",
  "choose_backup_destination_command,",
  "choose_restore_source_command,",
  "create_backup_command,",
  "prepare_restore_command,",
  "confirm_restore_command",
  "builder",
  ".plugin(tauri_plugin_dialog::init())",
  ".invoke_handler(tauri::generate_handler![",
  "search_products_command,",
  "browse_products_command,",
  "confirm_sale_command,",
  "create_sale_return_command,",
  "cancel_sale_command,",
  "confirm_stock_entry_command,",
  "confirm_physical_count_command,",
  "list_inventory_alerts_command,",
  "list_catalog_maintenance_command,",
  "list_catalog_categories_command,",
  "maintain_catalog_command,",
  "edit_catalog_command",
  "catalog_metadata_detail_command,",
  "list_categories_command,",
  "create_category_command,",
  "create_product_command,",
  "list_sales_history_command,",
  "])",
  "command_builder(builder.plugin(tauri_plugin_dialog::init()))",
  "fn browse_products_command(",
  "state: tauri::State<AppState>,",
  "request: commands::catalog::BrowseProductsRequest,",
  ") -> Result<commands::catalog::ProductBrowseResponse, String> {",
  "state.with_read(|connection| Ok(commands::catalog::browse_products(connection, request)))",
  "fn list_catalog_categories_command(",
  ") -> Result<commands::catalog::CatalogMaintenanceListResponse, String> {",
  "state.with_read(commands::catalog::list_catalog_categories)",
  "commands::catalog::list_catalog_categories",
  "async fn choose_backup_destination_command(",
  "window: tauri::WebviewWindow,",
  "async fn choose_backup_destination_command<R: Runtime>(",
  "window: tauri::WebviewWindow<R>,",
  "window",
  ".app_handle()",
  ".dialog()",
  ".file()",
  ".pick_folder(move |path| {",
  "complete(path.and_then(|path| path.into_path().ok()));",
  "});",
  "#[cfg(test)]",
  "{",
  "let _ = window;",
  "complete(None);",
  "}",
  "#[cfg(not(test))]",
  "async fn choose_restore_source_command(",
  "async fn choose_restore_source_command<R: Runtime>(",
  ".add_filter(\"SQLite backup\", &[\"sqlite3\"])",
  ".pick_file(move |path| {",
  "#[cfg(any(windows, target_os = \"android\"))]",
  "const IPC_URL: &str = \"http://tauri.localhost\";",
  "#[cfg(not(any(windows, target_os = \"android\")))]",
  "const IPC_URL: &str = \"tauri://localhost\";",
  "",
  "url: \"tauri://localhost\".parse().unwrap(),",
  "url: IPC_URL.parse().unwrap(),",
  ".manage(Mutex::new(commands::backup::BackupCommandState::new(",
  "std::env::temp_dir(),",
  ")))",
  "#[test]",
  "fn registers_backup_commands_at_the_tauri_command_seam() {",
  "let (_app, window) = test_window();",
  "for command in [",
  "\"choose_backup_destination_command\",",
  "\"choose_restore_source_command\",",
  "] {",
  "let response = get_ipc_response(&window, request(command)).unwrap();",
  "assert_eq!(",
  "response.deserialize::<serde_json::Value>().unwrap(),",
  "serde_json::json!({ \"kind\": \"cancelled\" }),",
  "\"{command} must return the test cancellation response\",",
  ");",
  "assert!(get_ipc_response(",
  "&window,",
  "request_with(",
  "\"create_backup_command\",",
  "serde_json::json!({ \"destination\": \"/definitely/missing\" }),",
  "),",
  ")",
  ".is_ok());",
  "\"prepare_restore_command\",",
  "serde_json::json!({ \"source\": \"/definitely/missing.sqlite3\" }),",
  "\"confirm_restore_command\",",
  "serde_json::json!({ \"token\": \"unknown\", \"confirmed\": true }),",
  "}",
]);

const categorySchemaRegistrationLineAllowlist = new Set([
  "edit_category_schema_command,",
  "#[cfg(feature = \"desktop\")]",
  "#[tauri::command]",
  "fn edit_category_schema_command(",
  "state: tauri::State<AppState>,",
  "request: commands::catalog::EditCategorySchemaRequest,",
  ") -> commands::catalog::CatalogMaintenanceResponse {",
  "state",
  ".with_write(|connection| Ok(commands::catalog::edit_category_schema(connection, request)))",
  ".unwrap_or_else(|error| {",
  "commands::catalog::CatalogMaintenanceResponse::Error(",
  "commands::catalog::map_command_state_error(&error),",
  ")",
  "})",
  "}",
  "",
  "assert!(get_ipc_response(&window, request_with(\"edit_category_schema_command\", serde_json::json!({ \"category_id\": 1, \"expected_revision\": 1, \"fields\": [] }))).is_ok());",
]);

function assertCategorySchemaRegistrationAllowlist(libDiff: string) {
  const changedLines = libDiff
    .split("\n")
    .filter((line) => /^[+-](?![+-])/.test(line));
  assert.match(libDiff, /edit_category_schema_command/);
  assert.ok(
    changedLines.every((line) => categorySchemaRegistrationLineAllowlist.has(line.slice(1).trim())),
    "unexpected Category Field Management command registration drift",
  );
}

function assertCatalogRegistrationAllowlist(libDiff: string) {
  const changedLines = libDiff
    .split("\n")
    .filter((line) => /^[+-](?![+-])/.test(line));
  assert.match(libDiff, /browse_products_command/);
  assert.match(libDiff, /list_catalog_categories_command/);
  assert.ok(
    changedLines.every((line) => ticket11RegistrationLineAllowlist.has(line.slice(1).trim())),
    "unexpected Catalog command registration drift",
  );
}

const grossProfitCommandRegistrationLines = [
  "gross_profit_report_command,",
  "gross_profit_operations_command,",
  "",
  "#[cfg(feature = \"desktop\")]",
  "#[tauri::command]",
  "fn gross_profit_report_command(",
  "state: tauri::State<AppState>,",
  "request: commands::gross_profit::GrossProfitRequest,",
  ") -> commands::gross_profit::GrossProfitResponse {",
  "state.with_read(|connection| Ok(commands::gross_profit::gross_profit(connection, request)))",
  ".unwrap_or_else(|_| commands::gross_profit::GrossProfitResponse::Error(commands::gross_profit::GrossProfitError {",
  "code: \"persistence_failure\", message: \"The gross-profit report could not be loaded.\",",
  "}))",
  "}",
  "#[cfg(feature = \"desktop\")]",
  "#[tauri::command]",
  "fn gross_profit_operations_command(",
  "state: tauri::State<AppState>,",
  "request: commands::gross_profit_operations::GrossProfitOperationsRequest,",
  ") -> commands::gross_profit_operations::GrossProfitOperationsResponse {",
  "state.with_read(|connection| Ok(commands::gross_profit_operations::gross_profit_operations(connection, request)))",
  ".unwrap_or_else(|_| commands::gross_profit_operations::GrossProfitOperationsResponse::Error(",
  "commands::gross_profit_operations::GrossProfitOperationsError {",
  "code: \"persistence_failure\",",
  "message: \"The gross-profit operations could not be loaded.\",",
  ")",
  "));",
  "fn registers_gross_profit_operations_command_with_strict_paged_request_at_ipc_seam() {",
  "let (app, window) = test_window();",
  "let before = app.state::<AppState>().with_read(|connection| Ok(snapshot(connection))).unwrap();",
  "let response = get_ipc_response(&window, request_with(\"gross_profit_operations_command\", serde_json::json!({",
  "\"from_utc\": \"2024-03-10T05:00:00.000Z\",",
  "\"to_exclusive_utc\": \"2024-03-11T04:00:00.000Z\",",
  "\"page\": 1,",
  "\"page_size\": 20",
  "}))).unwrap();",
  "let payload = response.deserialize::<serde_json::Value>().unwrap();",
  "assert_eq!(payload[\"kind\"], \"success\");",
  "assert_eq!(payload[\"report\"][\"total\"], 0);",
  "assert_eq!(app.state::<AppState>().with_read(|connection| Ok(snapshot(connection))).unwrap(), before);",
];

function assertGrossProfitCommandRegistrationDiff(libDiff: string) {
  const changedLines = libDiff.split("\n").filter((line) => /^[+-](?![+-])/.test(line));
  const operationCommandLines = new Set([
    "gross_profit_operations_command,", "#[cfg(feature = \"desktop\")]", "#[tauri::command]",
    "fn gross_profit_operations_command(", "state: tauri::State<AppState>,",
    "request: commands::gross_profit_operations::GrossProfitOperationsRequest,",
    ") -> commands::gross_profit_operations::GrossProfitOperationsResponse {",
    "state.with_read(|connection| Ok(commands::gross_profit_operations::gross_profit_operations(connection, request)))",
    ".unwrap_or_else(|_| commands::gross_profit_operations::GrossProfitOperationsResponse::Error(",
    "commands::gross_profit_operations::GrossProfitOperationsError {",
    "code: \"persistence_failure\",",
    "message: \"The gross-profit operations could not be loaded.\",",
    ")", "));", "))", "}", "},", "",
    "#[test]", "fn registers_gross_profit_operations_command_with_strict_paged_request_at_ipc_seam() {",
    "let (app, window) = test_window();",
    "let before = app.state::<AppState>().with_read(|connection| Ok(snapshot(connection))).unwrap();",
    "let response = get_ipc_response(&window, request_with(\"gross_profit_operations_command\", serde_json::json!({",
    "\"from_utc\": \"2024-03-10T05:00:00.000Z\",", "\"to_exclusive_utc\": \"2024-03-11T04:00:00.000Z\",",
    "\"page\": 1,", "\"page_size\": 20", "}))).unwrap();",
    "let payload = response.deserialize::<serde_json::Value>().unwrap();", "assert_eq!(payload[\"kind\"], \"success\");",
    "assert_eq!(payload[\"report\"][\"total\"], 0);",
    "assert_eq!(app.state::<AppState>().with_read(|connection| Ok(snapshot(connection))).unwrap(), before);",
  ]);
  if (libDiff.includes("gross_profit_operations_command")) {
    assert.deepEqual(changedLines.filter((line) => !operationCommandLines.has(line.slice(1).trim())).map((line) => line.slice(1).trim()), [], "unexpected gross-profit operations command registration drift");
    return;
  }
  assert.deepEqual(changedLines.map((line) => line.slice(1).trim()).sort(), [...grossProfitCommandRegistrationLines].sort(), "unexpected gross-profit command registration drift");
  assert.match(libDiff, /gross_profit_report_command/);
}

function assertDashboardRegistrationAllowlist(libDiff: string) {
  const changedLines = libDiff
    .split("\n")
    .filter((line) => /^[+-](?![+-])/.test(line));
  assert.match(libDiff, /dashboard_command/);
  assert.match(libDiff, /registers_read_only_dashboard_command_at_the_tauri_command_seam/);
  assert.ok(
    changedLines.every((line) => dashboardRegistrationLineAllowlist.has(line.slice(1).trim())),
    "unexpected Dashboard command registration drift",
  );
}

const commandSeamPricingLineAllowlist = new Set([
  "                acknowledged_price_centavos: None,",
  "            acknowledged_price_centavos: None,",
  "fn exposes_catalog_price_without_physical_storage_terminology() {",
  "fn exposes_sale_price_without_physical_storage_terminology() {",
  "    assert_eq!(results[0].catalog_unit_price_centavos, 2_500);",
  "    assert_eq!(results[0].sale_price_centavos, 2_500);",
  "            list_price_centavos: 5_000,",
  "            purchase_price_centavos: 3_000,",
  "            sale_price_centavos: 5_000,",
  `    let product = r#"{"sku":"BRG-1","name":"Wheel bearing","category_id":1,"list_price_centavos":5000,"minimum_sale_price_centavos":4000,"opening_quantity":3,"attribute_values":[],"unexpected":true}"#;`,
  `    let product = r#"{"sku":"BRG-1","name":"Wheel bearing","category_id":1,"purchase_price_centavos":3000,"sale_price_centavos":5000,"minimum_sale_price_centavos":4000,"opening_quantity":3,"attribute_values":[],"unexpected":true}"#;`,
  "fn onboarded_product_searches_and_sells_at_its_backend_catalog_price() {",
  "fn onboarded_product_searches_and_sells_at_its_backend_sale_price() {",
  "            low_stock_threshold: None,",
  "        \"attribute_values\", \"available_quantity\", \"category_id\", \"category_name\", \"minimum_sale_price_centavos\", \"name\", \"primary_location_code\", \"product_id\", \"purchase_price_centavos\", \"revision\", \"sale_price_centavos\", \"sku\"",
  "        \"attribute_values\", \"available_quantity\", \"category_id\", \"category_name\", \"minimum_sale_price_centavos\", \"name\", \"product_id\", \"purchase_price_centavos\", \"revision\", \"sale_price_centavos\", \"sku\"",
  "    assert_eq!(results[0].catalog_unit_price_centavos, 5_000);",
  "            low_stock_threshold: None,",
  "        assert_eq!(results[0].list_price_centavos, 5_000);",
  "        assert_eq!(results[0].minimum_sale_price_centavos, 4_000);",
  "    assert_eq!(results[0].purchase_price_centavos, Some(3_000));",
  "    assert_eq!(results[0].sale_price_centavos, 5_000);",
  "    assert_eq!(results[0].minimum_sale_price_centavos, 4_000);",
  "                captured_unit_price_centavos: 4_000,",
  "                captured_unit_price_centavos: 5_000,",
  "                final_unit_price_centavos: None,",
  "                final_unit_price_centavos: Some(5_000),",
  "                qr_applied_centavos: Some(4_000),",
  "                qr_applied_centavos: Some(5_000),",
  "    assert_eq!(summary.lines[0].unit_price_centavos, 4_000);",
  "    assert_eq!(summary.lines[0].unit_price_centavos, 5_000);",
  "    assert_eq!(product.list_price_centavos, 5_000);",
  "    assert_eq!(product.purchase_price_centavos, 3_000);",
  "    assert_eq!(product.sale_price_centavos, 5_000);",
  "    assert_eq!(product.minimum_sale_price_centavos, 4_000);",
]);

const salesBrowseCommandSeamLineAllowlist = new Set([
  "-use repuestos_autos::commands::catalog::{browse_products, search_products, BrowseProductsRequest, ProductBrowseResponse, SearchProductsRequest};",
  "+use repuestos_autos::commands::catalog::{browse_products, browse_sale_products, search_products, BrowseProductsRequest, ProductBrowseResponse, SearchProductsRequest};",
  "+#[test]",
  "+fn sales_browse_command_serializes_only_bounded_safe_product_attributes() {",
  "+    let connection = open_seeded_catalog().unwrap();",
  "+    connection.execute(\"UPDATE products SET purchase_price_centavos = 7777, revision = 9 WHERE id = 1\", []).unwrap();",
  "+    connection.execute(\"INSERT INTO attribute_definitions (id, category_id, label, field_type, required) VALUES (7, 1, 'Material', 'text', 0)\", []).unwrap();",
  "+    connection.execute(\"INSERT INTO product_attribute_values (product_id, definition_id, text_value, searchable_value) VALUES (1, 7, 'Paper', 'Paper')\", []).unwrap();",
  "+    let page = browse_sale_products(&connection, BrowseProductsRequest {",
  "+        query: Some(\"filtro\".into()), category_id: Some(1), stock_state: \"all\".into(), activity: \"all\".into(), page: 1, page_size: 20,",
  "+    }).unwrap();",
  "+    let value = serde_json::to_value(&page).unwrap();",
  "+    assert_eq!(value[\"products\"][0].as_object().unwrap().keys().map(String::as_str).collect::<Vec<_>>(), vec![",
  "+        \"attribute_values\", \"available_quantity\", \"category_id\", \"category_name\", \"minimum_sale_price_centavos\", \"name\", \"product_id\", \"sale_price_centavos\", \"sku\"",
  "+    ]);",
  "+    assert_eq!(value[\"products\"][0][\"attribute_values\"], serde_json::json!([",
  "+        { \"definition_id\": 7, \"label\": \"Material\", \"value\": \"Paper\" }",
  "+    ]));",
  "+    assert!(!value.to_string().contains(\"7777\"));",
  "+    assert!(!value.to_string().contains(\"revision\"));",
  "+    assert!(!value.to_string().contains(\"location\"));",
  "+    assert!(!value.to_string().contains(\"activity\"));",
  "+}",
  "+",
]);

function assertCommandSeamPricingAllowlist(commandSeamDiff: string) {
  if (commandSeamDiff.includes("sales_browse_command_serializes_only_bounded_safe_product_attributes")) {
    const changed = commandSeamDiff.split("\n").filter((line) => /^[+-](?![+-])/.test(line));
    const authorized = changed.filter((line) => salesBrowseCommandSeamLineAllowlist.has(line));
    assert.deepEqual(authorized.sort(), [...salesBrowseCommandSeamLineAllowlist].sort());
    commandSeamDiff = commandSeamDiff.split("\n").filter((line) => !salesBrowseCommandSeamLineAllowlist.has(line)).join("\n");
  }
  const changedLines = commandSeamDiff
    .split("\n")
    .filter((line) => /^[+-](?![+-])/.test(line));
  if (changedLines.length === 0) return;
  if (commandSeamDiff.includes("low_stock_threshold: None")) {
    assert.match(commandSeamDiff, /onboarded_product_searches_and_sells_at_its_backend_sale_price/);
    assert.match(commandSeamDiff, /primary_location_code/);
    assert.equal(changedLines.filter((line) => line === "+            low_stock_threshold: None,").length, 2);
    assert.equal(changedLines.filter((line) => line.includes("primary_location_code")).length, 1);
  } else {
    assert.match(commandSeamDiff, /onboarded_product_searches_and_sells_at_its_backend_sale_price/);
    assert.match(commandSeamDiff, /captured_unit_price_centavos: 5_000/);
    assert.match(commandSeamDiff, /qr_applied_centavos: Some\(5_000\)/);
    assert.match(commandSeamDiff, /summary\.lines\[0\]\.unit_price_centavos, 5_000/);
  }
  assert.ok(
    changedLines.every((line) => commandSeamPricingLineAllowlist.has(line.slice(1))),
    "unexpected command-seam contract-test drift",
  );
}

const catalogImageRegistrationLineAllowlist = new Set([
  "choose_product_image_command,",
  "remove_product_image_command,",
  "catalog_product_image_thumbnail_command,",
  "#[cfg(feature = \"desktop\")]",
  "#[tauri::command]",
  "async fn choose_product_image_command<R: Runtime>(",
  "state: tauri::State<'_, AppState>,",
  "window: tauri::WebviewWindow<R>,",
  "request: commands::catalog::ProductImageRequest,",
  ") -> commands::catalog::ProductImageResponse {",
  "let Ok(request) = commands::catalog::parse_product_image_request(request) else {",
  "return commands::catalog::ProductImageResponse::Error(commands::catalog::CatalogMaintenanceError {",
  "code: \"validation_error\", message: \"Review the catalog values and try again.\",",
  "});",
  "};",
  "let selection = commands::backup::select_callback_path(|complete| {",
  "#[cfg(test)]",
  "{ let _ = window; complete(None); }",
  "#[cfg(not(test))]",
  "{ window.app_handle().dialog().file().add_filter(\"Product image\", &[\"png\", \"jpg\", \"jpeg\", \"webp\"]).pick_file(move |path| {",
  "complete(path.and_then(|path| path.into_path().ok()));",
  "}); }",
  "}).await;",
  "let commands::backup::PathSelection::Selected { path } = selection else {",
  "return commands::catalog::ProductImageResponse::Cancelled;",
  "};",
  "let read_result = read_selected_image(&path);",
  "let (mime, bytes) = match read_result {",
  "Ok(value) => value,",
  "Err(()) => return commands::catalog::ProductImageResponse::Error(commands::catalog::CatalogMaintenanceError {",
  "code: \"image_unavailable\", message: \"The selected image could not be used.\",",
  "}),",
  "};",
  "state.with_write(|connection| Ok(commands::catalog::persist_selected_product_image(",
  "connection, request.product_id, request.expected_revision, mime, bytes,",
  "))).unwrap_or_else(|_| commands::catalog::ProductImageResponse::Error(commands::catalog::CatalogMaintenanceError {",
  "code: \"persistence_failure\", message: \"The catalog could not be completed.\",",
  "}))",
  "fn read_selected_image(path: &std::path::Path) -> Result<(&'static str, Vec<u8>), ()> {",
  "use std::io::Read;",
  "const MAX_BYTES: u64 = application::catalog::MAX_PRODUCT_IMAGE_BYTES as u64;",
  "let mut file = std::fs::File::open(path).map_err(|_| ())?;",
  "if file.metadata().map_err(|_| ())?.len() > MAX_BYTES { return Err(()); }",
  "let mut bytes = Vec::new();",
  "file.take(MAX_BYTES + 1).read_to_end(&mut bytes).map_err(|_| ())?;",
  "if bytes.len() as u64 > MAX_BYTES { return Err(()); }",
  "let extension = path.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase();",
  "let mime = match extension.as_str() { \"png\" => \"image/png\", \"jpg\" | \"jpeg\" => \"image/jpeg\", \"webp\" => \"image/webp\", _ => return Err(()) };",
  "Ok((mime, bytes))",
  "fn remove_product_image_command(",
  "state: tauri::State<AppState>, request: commands::catalog::ProductImageRequest,",
  ") -> commands::catalog::ProductImageResponse {",
  "state.with_write(|connection| Ok(commands::catalog::remove_product_image(connection, request)))",
  ".unwrap_or_else(|_| commands::catalog::ProductImageResponse::Error(commands::catalog::CatalogMaintenanceError {",
  "fn catalog_product_image_thumbnail_command(",
  ") -> commands::catalog::ProductImageThumbnailResponse {",
  "state.with_read(|connection| Ok(commands::catalog::catalog_product_image_thumbnail(connection, request)))",
  ".unwrap_or_else(|_| commands::catalog::ProductImageThumbnailResponse::Error(commands::catalog::CatalogMaintenanceError {",
  "#[test]",
  "fn registers_catalog_image_commands_without_exposing_picker_paths() {",
  "let (_app, window) = test_window();",
  "let picker = get_ipc_response(&window, request_with(\"choose_product_image_command\", serde_json::json!({ \"product_id\": 1, \"expected_revision\": 0 }))).unwrap();",
  "assert_eq!(picker.deserialize::<serde_json::Value>().unwrap(), serde_json::json!({ \"kind\": \"cancelled\" }));",
  "for command in [\"remove_product_image_command\", \"catalog_product_image_thumbnail_command\"] {",
  "let response = get_ipc_response(&window, request_with(command, serde_json::json!({ \"product_id\": 1, \"expected_revision\": 0 }))).unwrap();",
  "let value = response.deserialize::<serde_json::Value>().unwrap();",
  "assert!(!value.to_string().contains(\"path\"));",
  "}",
  "",
]);

function assertCatalogImageRegistrationAllowlist(libDiff: string) {
  const changedLines = libDiff
    .split("\n")
    .filter((line) => /^[+-](?![+-])/.test(line));
  for (const marker of ["choose_product_image_command", "remove_product_image_command", "catalog_product_image_thumbnail_command"]) {
    assert.match(libDiff, new RegExp(marker), `missing Catalog image marker: ${marker}`);
  }
  assert.ok(
    changedLines.every((line) => catalogImageRegistrationLineAllowlist.has(line.slice(1).trim())),
    "unexpected Catalog image command registration drift",
  );
}

const productLocationRegistrationLineAllowlist = new Set([
  "",
  "location_schema_command,",
  "save_location_schema_command,",
  "list_product_locations_command,",
  "create_product_location_command,",
  "activate_product_location_command,",
  "deactivate_product_location_command,",
  "delete_product_location_command,",
  "assign_product_primary_location_command,",
  "#[cfg(feature = \"desktop\")]",
  "#[tauri::command]",
  "fn location_schema_command(state: tauri::State<AppState>) -> commands::catalog::ProductLocationResponse {",
  "state.with_read(|connection| Ok(commands::catalog::location_schema(connection)))",
  ".unwrap_or_else(|_| commands::catalog::ProductLocationResponse::Error(commands::catalog::CatalogLocationError { code: \"persistence_failure\", message: \"The location change could not be completed.\" }))",
  "}",
  "fn save_location_schema_command(state: tauri::State<AppState>, request: commands::catalog::SaveLocationSchemaRequest) -> commands::catalog::ProductLocationResponse {",
  "state.with_write(|connection| Ok(commands::catalog::save_location_schema(connection, request)))",
  "fn list_product_locations_command(state: tauri::State<AppState>, request: commands::catalog::ListProductLocationsRequest) -> commands::catalog::ProductLocationResponse {",
  "state.with_read(|connection| Ok(commands::catalog::list_product_locations(connection, request)))",
  "fn create_product_location_command(state: tauri::State<AppState>, request: commands::catalog::CreateProductLocationRequest) -> commands::catalog::ProductLocationResponse {",
  "state.with_write(|connection| Ok(commands::catalog::create_product_location(connection, request)))",
  "fn activate_product_location_command(state: tauri::State<AppState>, request: commands::catalog::ProductLocationLifecycleRequest) -> commands::catalog::ProductLocationResponse {",
  "state.with_write(|connection| Ok(commands::catalog::set_product_location_activity(connection, request, true)))",
  "fn deactivate_product_location_command(state: tauri::State<AppState>, request: commands::catalog::ProductLocationLifecycleRequest) -> commands::catalog::ProductLocationResponse {",
  "state.with_write(|connection| Ok(commands::catalog::set_product_location_activity(connection, request, false)))",
  "fn delete_product_location_command(state: tauri::State<AppState>, request: commands::catalog::ProductLocationLifecycleRequest) -> commands::catalog::ProductLocationResponse {",
  "state.with_write(|connection| Ok(commands::catalog::delete_product_location(connection, request)))",
  "fn assign_product_primary_location_command(state: tauri::State<AppState>, request: commands::catalog::AssignProductLocationRequest) -> commands::catalog::ProductLocationResponse {",
  "state.with_write(|connection| Ok(commands::catalog::assign_product_primary_location(connection, request)))",
  "#[test]",
  "fn registers_product_location_contract_commands_at_the_tauri_command_seam() {",
  "let (_app, window) = test_window();",
  "assert!(get_ipc_response(&window, request(\"location_schema_command\")).is_ok());",
  "assert!(get_ipc_response(&window, request_with(\"save_location_schema_command\", serde_json::json!({ \"expected_revision\": 0, \"segments\": [\"Zone\"] }))).is_ok());",
  "assert!(get_ipc_response(&window, request_with(\"list_product_locations_command\", serde_json::json!({ \"include_inactive\": false }))).is_ok());",
  "assert!(get_ipc_response(&window, request_with(\"create_product_location_command\", serde_json::json!({ \"values\": [\"A1\"] }))).is_ok());",
  "for (command, payload) in [",
  "(\"activate_product_location_command\", serde_json::json!({ \"location_id\": 1, \"expected_revision\": 0 })),",
  "(\"deactivate_product_location_command\", serde_json::json!({ \"location_id\": 1, \"expected_revision\": 0 })),",
  "(\"delete_product_location_command\", serde_json::json!({ \"location_id\": 1, \"expected_revision\": 0 })),",
  "(\"assign_product_primary_location_command\", serde_json::json!({ \"product_id\": 1, \"expected_revision\": 0, \"location_id\": 1 })),",
  "] {",
  "assert!(get_ipc_response(&window, request_with(command, payload)).is_ok(), \"{command}\");",
  "}",
]);

function assertProductLocationRegistrationAllowlist(libDiff: string) {
  const changedLines = libDiff
    .split("\n")
    .filter((line) => /^[+-](?![+-])/.test(line));
  assert.match(libDiff, /registers_product_location_contract_commands_at_the_tauri_command_seam/);
  assert.ok(
    changedLines.every((line) => productLocationRegistrationLineAllowlist.has(line.slice(1).trim())),
    "unexpected product location command registration drift",
  );
}

const reportsRegistrationLineAllowlist = new Set([
  "",
  "list_movement_ledger_command,",
  "list_movement_ledger_product_options_command,",
  "export_movement_ledger_command,",
  "#[cfg(feature = \"desktop\")]",
  "#[tauri::command]",
  "fn list_movement_ledger_command(",
  "state: tauri::State<AppState>,",
  "request: commands::movement_ledger::MovementLedgerRequest,",
  ") -> commands::movement_ledger::MovementLedgerResponse {",
  "state",
  ".with_read(|connection| Ok(commands::movement_ledger::list_movement_ledger(connection, request)))",
  ".unwrap_or_else(|_| {",
  "commands::movement_ledger::MovementLedgerResponse::Error(",
  "commands::movement_ledger::MovementLedgerCommandError {",
  "code: \"persistence_failure\",",
  "message: \"The movement ledger could not be loaded.\",",
  "}",
  ")",
  "},",
  "),",
  "))",
  "})",
  "fn list_movement_ledger_product_options_command(",
  "request: commands::movement_ledger::MovementLedgerProductOptionsRequest,",
  ") -> commands::movement_ledger::MovementLedgerProductOptionsResponse {",
  "state.with_read(|connection| Ok(commands::movement_ledger::list_movement_ledger_product_options(connection, request)))",
  ".unwrap_or_else(|_| commands::movement_ledger::MovementLedgerProductOptionsResponse::Error(",
  "message: \"The movement ledger products could not be loaded.\",",
  "async fn export_movement_ledger_command<R: Runtime>(",
  "app_handle: tauri::AppHandle<R>,",
  "request: commands::movement_ledger::MovementLedgerExportRequest,",
  ") -> Result<commands::movement_ledger::MovementLedgerExportResponse, String> {",
  "#[cfg(test)]",
  "{",
  "let _ = (app_handle, request);",
  "Ok(commands::movement_ledger::MovementLedgerExportResponse::Cancelled)",
  "}",
  "#[cfg(not(test))]",
  "let selection = commands::backup::select_callback_path(|complete| {",
  "app_handle.dialog().file()",
  ".add_filter(\"PDF document\", &[\"pdf\"])",
  ".set_file_name(\"movement-ledger.pdf\")",
  ".save_file(move |path| {",
  "complete(path.and_then(|path| path.into_path().ok()));",
  "});",
  "}).await;",
  "let commands::backup::PathSelection::Selected { path } = selection else {",
  "return commands::movement_ledger::MovementLedgerExportResponse::Cancelled;",
  "};",
  "let generated_at = time::OffsetDateTime::now_utc()",
  ".format(&time::format_description::well_known::Rfc3339)",
  ".unwrap_or_else(|_| \"Unavailable\".to_string());",
  "let state = app_handle.state::<AppState>();",
  "let response = state.with_read(|connection| Ok(commands::movement_ledger::export_movement_ledger(",
  ".unwrap_or_else(|_| commands::movement_ledger::MovementLedgerExportResponse::Error(",
  "connection, request, &generated_at, |bytes| {",
  "std::fs::write(&path, bytes).map_or(",
  "commands::movement_ledger::ExportSaveResult::Failed,",
  "|_| commands::movement_ledger::ExportSaveResult::Saved,",
  "},",
  "),",
  "}))).unwrap_or_else(|_| commands::movement_ledger::MovementLedgerExportResponse::Error(",
  "))).unwrap_or_else(|_| commands::movement_ledger::MovementLedgerExportResponse::Error(",
  "}),",
  "));",
  "Ok(response)",
  "return Ok(commands::movement_ledger::MovementLedgerExportResponse::Cancelled);",
  "}",
]);

const removedReportsRegistrationLineAllowlist = new Set([
  "state.with_read(|connection| Ok(commands::movement_ledger::list_movement_ledger_product_options(connection)))",
  "state: tauri::State<'_, AppState>,",
  "window: tauri::WebviewWindow<R>,",
  ") -> commands::movement_ledger::MovementLedgerExportResponse {",
  "let _ = (state, window, request);",
  "commands::movement_ledger::MovementLedgerExportResponse::Cancelled",
  "return commands::movement_ledger::MovementLedgerExportResponse::Cancelled;",
  "let app_handle = window.app_handle().clone();",
  "drop(window);",
  "state.with_read(|connection| Ok(commands::movement_ledger::export_movement_ledger(",
  "))",
]);

function assertReportsRegistrationAllowlist(libDiff: string, contract: "export" | "product-options" = "export") {
  const changedLines = libDiff
    .split("\n")
    .filter((line) => /^[+-](?![+-])/.test(line));
  if (contract === "product-options") {
    assert.match(libDiff, /MovementLedgerProductOptionsRequest/, "missing Reports bounded product-options request marker");
  } else {
    assert.match(libDiff, /export_movement_ledger_command/, "missing Reports export command marker");
  }
  const unexpectedLines = changedLines.filter((line) => {
    const content = line.slice(1).trim();
    return line.startsWith("+")
      ? !reportsRegistrationLineAllowlist.has(content)
      : !removedReportsRegistrationLineAllowlist.has(content);
  });
  assert.deepEqual(unexpectedLines, [], "unexpected Reports command registration drift");
}

function assertBackupRecoveryStartupAllowlist(libDiff: string) {
  const changedLines = libDiff.split("\n").filter((line) => /^[+-](?![+-])/.test(line));
  assert.match(libDiff, /retained_recovery_evidence_is_valid/);
  assert.match(libDiff, /has_ambiguous_temporary_artifacts/);
  const allowedStartupHunks = new Set([51, 53, 66, 178, 204, 210, 218, 224, 242, 280, 288, 304, 311, 360, 377]);
  const allowedBackupRecoveryHunks = new Set([...allowedStartupHunks, 58, 192, 210, 243, 261, 385, 698, 706, 710, 717, 725, 729, 734, 742, 746, 754, 762, 766, 863, 866, 871, 874, 875, 878, 1516, 1524, 1528, 1547, 1555, 1559, 1689, 1697, 1701, 1705, 1709]);
  const hunks = libDiff.split(/(?=^@@ )/m);
  const changedHunks = hunks.filter((hunk) => /^[+-](?![+-])/m.test(hunk));
  const unexpectedHunks = changedHunks.filter((hunk) => {
    const header = hunk.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    return !header || !allowedBackupRecoveryHunks.has(Number(header[1]));
  });
  assert.deepEqual(unexpectedHunks, [], "unexpected backup recovery/lib command-seam hunk drift");
  const startupLines = hunks.flatMap((hunk) => {
    const header = hunk.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (!header || !allowedStartupHunks.has(Number(header[1]))) return [];
    return hunk.split("\n").filter((line) => /^[+-](?![+-])/.test(line));
  });
  assert.ok(startupLines.length > 0, "expected bounded backup recovery startup hunks");
  assert.ok(changedLines.length >= startupLines.length, "recovery audit must not omit unrelated lib.rs changes");
  const registrationLines = changedLines.filter((line) => ticket11RegistrationLineAllowlist.has(line.slice(1).trim()));
  const registrationDiff = [
    "+fn command_builder<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {",
    "+choose_backup_destination_command,",
    "+choose_restore_source_command,",
    "+create_backup_command,",
    "+prepare_restore_command,",
    "+confirm_restore_command",
    ...registrationLines,
    "+command_builder(builder.plugin(tauri_plugin_dialog::init()))",
  ].join("\n");
  assertTicket11RegistrationAllowlist(registrationDiff);
}

const windowsPickerCommandDiffLineAllowlist = new Set([
  "commands: tauri::State<'_, Mutex<commands::backup::BackupCommandState>>,",
  "let _ = window;",
  "window",
  ".app_handle()",
  ") -> commands::backup::BackupDestinationSelection {",
  ") -> commands::backup::RestoreSourceSelection {",
  "return commands::backup::BackupDestinationSelection::Cancelled;",
  "return commands::backup::BackupDestinationSelection::Error {",
  "};",
  "commands.select_backup_destination(path)",
  "return commands::backup::RestoreSourceSelection::Cancelled;",
  "return commands::backup::RestoreSourceSelection::Error {",
  "commands.select_restore_source(path)",
  ") -> Result<commands::backup::BackupDestinationSelection, String> {",
  "let app_handle = window.app_handle().clone();",
  "drop(window);",
  "let picker_app_handle = app_handle.clone();",
  "let _ = picker_app_handle;",
  "picker_app_handle",
  "return Ok(commands::backup::BackupDestinationSelection::Cancelled);",
  "let commands = app_handle.state::<Mutex<commands::backup::BackupCommandState>>();",
  "return Ok(commands::backup::BackupDestinationSelection::Error {",
  "});",
  "Ok(commands.select_backup_destination(path))",
  ") -> Result<commands::backup::RestoreSourceSelection, String> {",
  "return Ok(commands::backup::RestoreSourceSelection::Cancelled);",
  "let commands = app_handle.state::<Mutex<commands::backup::BackupCommandState>>();",
  "return Ok(commands::backup::RestoreSourceSelection::Error {",
  "Ok(commands.select_restore_source(path))",
]);

function assertWindowsPickerCommandDiffAllowlist(libDiff: string) {
  const changedLines = libDiff
    .split("\n")
    .filter((line) => /^[+-](?![+-])/.test(line));
  assert.match(libDiff, /Result<commands::backup::BackupDestinationSelection, String>/);
  assert.match(libDiff, /Result<commands::backup::RestoreSourceSelection, String>/);
  assert.ok(
    changedLines.every((line) => windowsPickerCommandDiffLineAllowlist.has(line.slice(1).trim())),
    "unexpected Windows picker-command diff drift",
  );
}

function assertTicket11RegistrationAllowlist(libDiff: string) {
  const changedLines = libDiff
    .split("\n")
    .filter((line) => /^[+-](?![+-])/.test(line));
  assert.ok(changedLines.length > 0, "expected ticket-11 lib.rs diff");
  for (const marker of ticket11RegistrationMarkers) {
    assert.match(libDiff, new RegExp(marker), `missing ticket-11 marker: ${marker}`);
  }
  assert.match(
    libDiff,
    /command_builder\(builder\.plugin\(tauri_plugin_dialog::init\(\)\)\)/,
    "missing production dialog/plugin registration seam",
  );
  assert.ok(
    changedLines.every((line) => ticket11RegistrationLineAllowlist.has(line.slice(1).trim())),
    "unexpected src-tauri/src/lib.rs drift outside the ticket-11 registration seam",
  );
}

function assertReportsCapabilityAllowlist(currentContent: string, baselineContent: string, capabilityDiff: string) {
  const current = parseJson(currentContent);
  const baseline = parseJson(baselineContent);
  const changedLines = capabilityDiff
    .split("\n")
    .filter((line) => /^[+-](?![+-])/.test(line))
    .map((line) => line.trim());

  if (baseline.permissions.includes("dialog:allow-save")) {
    assert.deepEqual(current, baseline, "unexpected uncommitted Reports capability drift");
    assert.deepEqual(changedLines, [], "committed Reports permission must not appear as uncommitted drift");
    return;
  }

  assert.deepEqual(baseline.permissions, ["core:default", "dialog:allow-open"]);
  assert.deepEqual(current, {
    ...baseline,
    permissions: [...baseline.permissions, "dialog:allow-save"],
  }, "Reports may only append dialog:allow-save to the existing capability");
  assert.deepEqual(changedLines, [
    '-  "permissions": ["core:default", "dialog:allow-open"]',
    '+  "permissions": ["core:default", "dialog:allow-open", "dialog:allow-save"]',
  ], "unexpected Reports capability diff");
}

const backupIntegrityDiffSha256Allowlist: Record<string, string> = {
  "src-tauri/src/lib.rs": "e04045f6ab23345b83fc89a19bf12d66df5bfd0a59ab35476eec033f42182ae3",
  "src-tauri/src/commands/backup.rs": "7169b1ec4fae68e8e9b08aa8c92011130e9f03e8ad716f2af706fe173166853b",
  "src-tauri/tests/backup_restore.rs": "bfd547aef8a58b83b871dab889922dd7642f4df0ad3d8dd5cfffca6ca4301ab8",
  "odd/tasks/backup-restore-integrity-hardening.md": "7bb231e22c5095e2007c15e420ad1a6a39f6dbe829080a2c16f21b0f631a72cb",
  "src/ui/w9-evidence-audit.test.ts": "bf0b5d8249a2ddf20e7652f260b93678a20909902b0743e2a87f779a5799940e",
  "src-tauri/src/infrastructure/filesystem/backup_store.rs": "5c93997017b3b59ac6069207867586788a381df42ac296415cbcf25347b4700c",
  "src-tauri/src/infrastructure/filesystem/restore_transitions.rs": "48e94bec5899ce2826548309281a9fe25d679f165fe47aceb0ca7ab722c8dd9d",
  "src-tauri/src/infrastructure/sqlite/backup.rs": "6f3d639a36f312b70af70641a9e3b723a563e02589b8876f791551f37d3eebf1",
  "src/commands/backup.ts": "22801231a00ee33709afa0e9ba5d67072775e9d1849edde32afafad693b00166",
  "src/commands/backup.test.ts": "2e832f565b509c1fe70cc25363153fcad69035a9ffd31e5f9d50fa3cd9110c84",
  "src/ui/backup/backup-flow.ts": "3070565d5f770fc9f8482c8951671663c612575390d8176ee7edf6b6b473de2f",
  "src/ui/backup/backup-flow.test.ts": "cfcf08a4834f1aac93b4eb89a9cdf1d21dbe5c337fc49eda465096adb655fe46",
  "src/ui/backup/backup-screen.ts": "b7a1fa63d38aec6719db217ee5fd0ad3f2495decfa29a4f96fc35f04234be809",
  "src/ui/backup/backup-screen.mounted.test.ts": "a8edf1386a28fdab5096581b3e5d41705e50214ada534825f44aa13bd17a3daf",
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

const catalogAccessCandidatePaths = [
  "odd/tasks/catalog-access-and-profit-report.md",
  "src-tauri/src/application/catalog/mod.rs",
  "src-tauri/src/commands/catalog.rs",
  "src-tauri/src/lib.rs",
  "src-tauri/tests/catalog_search.rs",
  "src/commands/catalog.test.ts",
  "src/commands/catalog.ts",
  "src/ui/inventory/inventory-screen.mounted.test.ts",
  "src/ui/inventory/inventory-screen.ts",
  "src/ui/onboarding/onboarding-screen.mounted.test.ts",
  "src/ui/onboarding/onboarding-screen.ts",
  "src/ui/w9-evidence-audit.test.ts",
];

const catalogAccessUnifiedDiffSha256 = "65df10d3e6bae980fd1b9b5df3606cd9756d15be528ba10e597e9ab0af78689d";

const grossProfitReportCandidatePaths = [
  "odd/tasks/catalog-access-and-profit-report.md",
  "src-tauri/src/application/reporting/mod.rs",
  "src-tauri/src/commands/mod.rs",
  "src-tauri/src/commands/gross_profit.rs",
  "src-tauri/src/infrastructure/sqlite/dashboard_repository.rs",
  "src-tauri/src/lib.rs",
  "src-tauri/tests/gross_profit_report.rs",
  "src/commands/gross-profit.ts",
  "src/commands/gross-profit.test.ts",
  "src/commands/sales-history.ts",
  "src/commands/sales-history.test.ts",
  "src/ui/app.ts",
  "src/ui/app-shell.mounted.test.ts",
  "src/ui/reports/gross-profit-report-screen.ts",
  "src/ui/reports/gross-profit-report-screen.mounted.test.ts",
  "src/ui/w9-evidence-audit.test.ts",
];

const grossProfitReportTaskBytesSha256 = "8485f4af59abeebdfc02b875593695e251adcb0cc0fc7cdad10df566afc39848";
const grossProfitReportCandidateDiffSha256 = "b7e94178ef05299dddfa5bd001206794afd4440564d802a519b156354b0826b3";

function grossProfitReportCandidateDiff() {
  return grossProfitReportCandidatePaths.map((path) => {
    const value = isTrackedPath(path)
      ? execFileSync("git", ["diff", "--unified=0", "HEAD", "--", path], { cwd: root, encoding: "utf8" })
      : readFileSync(resolve(root, path), "utf8");
    const normalized = path === "src/ui/w9-evidence-audit.test.ts"
      ? value
          .replaceAll(/^index \S+\.\.\S+.*$/gm, "index <SELF_INDEX>")
          .replaceAll(/^([+-])const grossProfitReportTaskBytesSha256 = "[^"]*";$/gm, '$1const grossProfitReportTaskBytesSha256 = "<SELF_TASK_HASH>";')
          .replaceAll(/^([+-])const grossProfitReportCandidateDiffSha256 = "[^"]*";$/gm, '$1const grossProfitReportCandidateDiffSha256 = "<SELF_DIFF_HASH>";')
          .replaceAll(/^([+-])(\s*"src\/ui\/w9-evidence-audit\.test\.ts": ")[^"]+(",)$/gm, '$1$2<SELF_W9_HASH>$3')
      : value;
    return `${path}\0${normalized}`;
  }).join("\0");
}

function assertGrossProfitReportCandidate(changedPaths: string[]) {
  const expected = [...grossProfitReportCandidatePaths].sort();
  assert.deepEqual(changedPaths.filter((path) => grossProfitReportCandidatePaths.includes(path)), expected);
  assert.equal(sha256(read("odd/tasks/catalog-access-and-profit-report.md")), grossProfitReportTaskBytesSha256, "unexpected T3 task document bytes");
  assert.equal(sha256(grossProfitReportCandidateDiff()), grossProfitReportCandidateDiffSha256, "unexpected T3 candidate diff or file bytes");
}

const grossProfitOperationsR3CandidatePaths = [
  "odd/tasks/reporte-ganancia-operaciones-pdf.md",
  "src/commands/gross-profit-operations.ts",
  "src/commands/gross-profit-operations.test.ts",
  "src/ui/reports/gross-profit-report-flow.ts",
  "src/ui/reports/gross-profit-report-flow.test.ts",
  "src/ui/reports/gross-profit-report-screen.ts",
  "src/ui/reports/gross-profit-report-screen.mounted.test.ts",
  "src/ui/w9-evidence-audit.test.ts",
];
const grossProfitOperationsR3TaskBytesSha256 = "f9fbe3f3055903382ab8c25dd74d92488ea68e3e46757cb4b9ad01d4e4865c98";
const grossProfitOperationsR3CandidateDiffSha256 = "d18c074173b55dbce142559d10486f4fa25aaa88d546955ccd48187276eea060";
const grossProfitDesktopFixtureTaskBytesSha256 = "5e42da0686f63d56a35bbd5466afd7c0de8f0089b88ce6b84e148f8cec41a79b";
const grossProfitDesktopFixtureLibDiffSha256 = "5ac5f20f47f773691b017f557885c2acb9ab26fc10c30fed7db5796f68dbfb54";

function isGrossProfitDesktopFixtureLibDiff(libDiff: string): boolean {
  return sha256(libDiff) === grossProfitDesktopFixtureLibDiffSha256
    && libDiff.includes("FileLicenseStorage::new(&std::env::temp_dir())");
}

function assertGrossProfitDesktopFixtureCandidate(changedPaths: string[], libDiff: string) {
  const candidatePaths = [
    "odd/tasks/reporte-ganancia-operaciones-pdf.md",
    "src-tauri/src/lib.rs",
    "src/ui/w9-evidence-audit.test.ts",
  ];
  assert.deepEqual(changedPaths.filter((path) => candidatePaths.includes(path)), candidatePaths);
  assert.equal(sha256(read("odd/tasks/reporte-ganancia-operaciones-pdf.md")), grossProfitDesktopFixtureTaskBytesSha256, "unexpected gross-profit desktop fixture task evidence");
  assert.equal(sha256(libDiff), grossProfitDesktopFixtureLibDiffSha256, "unexpected gross-profit desktop fixture lib.rs diff");
}
function grossProfitOperationsR3CandidateDiff() {
  return grossProfitOperationsR3CandidatePaths.map((path) => {
    const value = isTrackedPath(path)
      ? execFileSync("git", ["diff", "--unified=0", "HEAD", "--", path], { cwd: root, encoding: "utf8" })
      : readFileSync(resolve(root, path), "utf8");
    const normalized = path === "src/ui/w9-evidence-audit.test.ts"
      ? value
          .replaceAll(/^index \S+\.\.\S+.*$/gm, "index <SELF_INDEX>")
          .replaceAll(/^([+-])const grossProfitOperationsR3TaskBytesSha256 = "[^"]*";$/gm, '$1const grossProfitOperationsR3TaskBytesSha256 = "<SELF_TASK_HASH>";')
          .replaceAll(/^([+-])const grossProfitOperationsR3CandidateDiffSha256 = "[^"]*";$/gm, '$1const grossProfitOperationsR3CandidateDiffSha256 = "<SELF_DIFF_HASH>";')
          .replaceAll(/^([+-])(\s*"src\/ui\/w9-evidence-audit\.test\.ts": ")[^"]+(",)$/gm, '$1$2<SELF_W9_HASH>$3')
      : value;
    return `${path}\0${normalized}`;
  }).join("\0");
}
function assertGrossProfitOperationsR3Candidate(changedPaths: string[]) {
  assert.deepEqual(changedPaths.filter((path) => grossProfitOperationsR3CandidatePaths.includes(path)), [...grossProfitOperationsR3CandidatePaths].sort());
  assert.equal(sha256(read("odd/tasks/reporte-ganancia-operaciones-pdf.md")), grossProfitOperationsR3TaskBytesSha256, "unexpected R3 task document bytes");
  assert.equal(sha256(grossProfitOperationsR3CandidateDiff()), grossProfitOperationsR3CandidateDiffSha256, "unexpected R3 candidate diff or file bytes");
}

const grossProfitOperationsR4CandidatePaths = [
  "src-tauri/src/application/reporting/mod.rs",
  "src-tauri/src/infrastructure/sqlite/dashboard_repository.rs",
  "src-tauri/src/commands/gross_profit_operations.rs",
  "src-tauri/src/lib.rs",
  "src-tauri/tests/gross_profit_operations_export.rs",
  "src/commands/gross-profit-operations.ts",
  "src/commands/gross-profit-operations.test.ts",
  "src/ui/reports/gross-profit-report-flow.ts",
  "src/ui/reports/gross-profit-report-flow.test.ts",
  "src/ui/reports/gross-profit-report-screen.ts",
  "src/ui/reports/gross-profit-report-screen.mounted.test.ts",
  "src/ui/w9-evidence-audit.test.ts",
  "odd/tasks/reporte-ganancia-operaciones-pdf.md",
];
function assertGrossProfitOperationsR4Candidate(changedPaths: string[]) {
  assert.deepEqual(changedPaths.filter((path) => grossProfitOperationsR4CandidatePaths.includes(path)), [...grossProfitOperationsR4CandidatePaths].sort());
  assert.match(read("src/ui/reports/gross-profit-report-screen.ts"), /Exportar PDF/);
  assert.match(read("src/commands/gross-profit-operations.ts"), /export_gross_profit_operations_command/);
  assert.match(read("src-tauri/tests/gross_profit_operations_export.rs"), /every_matching_event/);
  assert.match(read("src-tauri/tests/gross_profit_operations_export.rs"), /operation_count_over_resource_limit/);
  assert.match(read("src-tauri/tests/gross_profit_operations_export.rs"), /pdf_renders_negative_profit_and_total_with_a_visible_ascii_minus/);
  assert.match(read("src-tauri/tests/gross_profit_operations_export.rs"), /rejects_cumulative_returns_above_sold_quantity_before_saving/);
  assert.match(read("src-tauri/tests/gross_profit_operations_export.rs"), /preserves_multiple_partial_returns_within_sold_quantity/);
  assert.match(read("src-tauri/src/application/reporting/mod.rs"), /GrossProfitOperationsExportReadError/);
  assert.match(read("src-tauri/src/commands/gross_profit_operations.rs"), /GrossProfitExportDateBound/);
  assert.match(read("src-tauri/src/commands/gross_profit_operations.rs"), /if centavos < 0 \{ \"-\" \}/);
  assert.match(read("src-tauri/src/commands/gross_profit_operations.rs"), /No calculable/);
  assert.match(read("src-tauri/src/lib.rs"), /path.into_path\(\).map\(Some\).map_err/);
  assert.match(read("src/ui/reports/gross-profit-report-flow.ts"), /resource_limit/);
  assert.match(read("src/ui/reports/gross-profit-report-screen.ts"), /supera los límites de recursos/);
  assert.match(read("src/ui/reports/gross-profit-report-flow.ts"), /export_status === "pending"/);
  assert.match(read("src-tauri/src/infrastructure/sqlite/dashboard_repository.rs"), /MAX_EXPORT_OPERATIONS: i64 = 10_000/);
  assert.match(read("odd/tasks/reporte-ganancia-operaciones-pdf.md"), /R4 Generar y guardar el PDF nativo/);
}

function assertGrossProfitPdfExportRegistration(libDiff: string) {
  assert.match(libDiff, /export_gross_profit_operations_command,/);
  assert.match(libDiff, /\.set_file_name\("informe-ganancia-bruta\.pdf"\)/);
  assert.match(libDiff, /\.save_file\(move \|path\|/);
  assert.match(libDiff, /registers_gross_profit_pdf_export_without_exposing_a_path_at_the_ipc_seam/);
  assert.match(libDiff, /GrossProfitOperationsExportResponse::Cancelled/);
}

const catalogResponsiveTableCandidatePaths = [
  "odd/tasks/catalog-access-and-profit-report.md",
  "src/ui/styles.css",
  "src/ui/catalog/catalog-maintenance-screen.mounted.test.ts",
  "src/ui/visual-system/base-styles.mounted.test.ts",
  "src/ui/w9-evidence-audit.test.ts",
];

const catalogResponsiveTableUnifiedDiffSha256 = "59892e0e3e5eb56cbf47ea62be4eaf9a22e69380e9365d4fd2a354355b321126";

type CurrentCandidateSelection =
  | { status: "NO_CANDIDATE" }
  | { status: "SELECTED"; profile: "desktop-fixture" | "R4" | "R3"; owner: "operations" }
  | { status: "SELECTED"; profile: "T3" | "responsive-table" | "catalog-access"; owner: "catalog" }
  | { status: "REJECTED"; reason: "NO_COMPLETE_PROFILE" | "AMBIGUOUS_PROFILE" };

// Path selection is not byte acceptance or historical execution evidence.
function selectCurrentCandidate(acquiredPaths: readonly string[]): CurrentCandidateSelection {
  const paths = new Set(acquiredPaths);
  if (paths.size === 0) return { status: "NO_CANDIDATE" };
  const matches: CurrentCandidateSelection[] = [];
  const complete = (expected: readonly string[]) =>
    paths.size === expected.length && expected.every((path) => paths.has(path));
  if (complete([
    "odd/tasks/reporte-ganancia-operaciones-pdf.md",
    "src-tauri/src/lib.rs",
    "src/ui/w9-evidence-audit.test.ts",
  ])) matches.push({ status: "SELECTED", profile: "desktop-fixture", owner: "operations" });
  if (complete(grossProfitOperationsR4CandidatePaths)) matches.push({ status: "SELECTED", profile: "R4", owner: "operations" });
  if (complete(grossProfitOperationsR3CandidatePaths)) matches.push({ status: "SELECTED", profile: "R3", owner: "operations" });
  if (complete(grossProfitReportCandidatePaths)) matches.push({ status: "SELECTED", profile: "T3", owner: "catalog" });
  if (complete(catalogResponsiveTableCandidatePaths)) matches.push({ status: "SELECTED", profile: "responsive-table", owner: "catalog" });
  if (complete(catalogAccessCandidatePaths)) matches.push({ status: "SELECTED", profile: "catalog-access", owner: "catalog" });
  if (matches.length > 1) return { status: "REJECTED", reason: "AMBIGUOUS_PROFILE" };
  return matches[0] ?? { status: "REJECTED", reason: "NO_COMPLETE_PROFILE" };
}

test("W9 current candidate policy reports an empty acquisition as non-proof", () => {
  assert.deepEqual(selectCurrentCandidate([]), { status: "NO_CANDIDATE" });
});

const currentCandidatePolicyExamples: {
  paths: string[];
  profile: string;
  owner: "operations" | "catalog";
}[] = [
  { profile: "desktop-fixture", owner: "operations", paths: [
    "odd/tasks/reporte-ganancia-operaciones-pdf.md",
    "src-tauri/src/lib.rs",
    "src/ui/w9-evidence-audit.test.ts",
  ] },
  { profile: "R4", owner: "operations", paths: [
    "src-tauri/src/application/reporting/mod.rs",
    "src-tauri/src/infrastructure/sqlite/dashboard_repository.rs",
    "src-tauri/src/commands/gross_profit_operations.rs",
    "src-tauri/src/lib.rs",
    "src-tauri/tests/gross_profit_operations_export.rs",
    "src/commands/gross-profit-operations.ts",
    "src/commands/gross-profit-operations.test.ts",
    "src/ui/reports/gross-profit-report-flow.ts",
    "src/ui/reports/gross-profit-report-flow.test.ts",
    "src/ui/reports/gross-profit-report-screen.ts",
    "src/ui/reports/gross-profit-report-screen.mounted.test.ts",
    "src/ui/w9-evidence-audit.test.ts",
    "odd/tasks/reporte-ganancia-operaciones-pdf.md",
  ] },
  { profile: "R3", owner: "operations", paths: [
    "odd/tasks/reporte-ganancia-operaciones-pdf.md",
    "src/commands/gross-profit-operations.ts",
    "src/commands/gross-profit-operations.test.ts",
    "src/ui/reports/gross-profit-report-flow.ts",
    "src/ui/reports/gross-profit-report-flow.test.ts",
    "src/ui/reports/gross-profit-report-screen.ts",
    "src/ui/reports/gross-profit-report-screen.mounted.test.ts",
    "src/ui/w9-evidence-audit.test.ts",
  ] },
  { profile: "T3", owner: "catalog", paths: [
    "odd/tasks/catalog-access-and-profit-report.md",
    "src-tauri/src/application/reporting/mod.rs",
    "src-tauri/src/commands/mod.rs",
    "src-tauri/src/commands/gross_profit.rs",
    "src-tauri/src/infrastructure/sqlite/dashboard_repository.rs",
    "src-tauri/src/lib.rs",
    "src-tauri/tests/gross_profit_report.rs",
    "src/commands/gross-profit.ts",
    "src/commands/gross-profit.test.ts",
    "src/commands/sales-history.ts",
    "src/commands/sales-history.test.ts",
    "src/ui/app.ts",
    "src/ui/app-shell.mounted.test.ts",
    "src/ui/reports/gross-profit-report-screen.ts",
    "src/ui/reports/gross-profit-report-screen.mounted.test.ts",
    "src/ui/w9-evidence-audit.test.ts",
  ] },
  { profile: "responsive-table", owner: "catalog", paths: [
    "odd/tasks/catalog-access-and-profit-report.md",
    "src/ui/styles.css",
    "src/ui/catalog/catalog-maintenance-screen.mounted.test.ts",
    "src/ui/visual-system/base-styles.mounted.test.ts",
    "src/ui/w9-evidence-audit.test.ts",
  ] },
  { profile: "catalog-access", owner: "catalog", paths: [
    "odd/tasks/catalog-access-and-profit-report.md",
    "src-tauri/src/application/catalog/mod.rs",
    "src-tauri/src/commands/catalog.rs",
    "src-tauri/src/lib.rs",
    "src-tauri/tests/catalog_search.rs",
    "src/commands/catalog.test.ts",
    "src/commands/catalog.ts",
    "src/ui/inventory/inventory-screen.mounted.test.ts",
    "src/ui/inventory/inventory-screen.ts",
    "src/ui/onboarding/onboarding-screen.mounted.test.ts",
    "src/ui/onboarding/onboarding-screen.ts",
    "src/ui/w9-evidence-audit.test.ts",
  ] },
];

for (const { paths, profile, owner } of currentCandidatePolicyExamples) {
  test(`W9 current candidate policy selects complete ${profile} ownership without byte approval`, () => {
    assert.deepEqual(selectCurrentCandidate(paths), { status: "SELECTED", profile, owner });
  });
}

test("W9 current candidate policy rejects partial profiles and task-only delegation", () => {
  for (const { paths } of currentCandidatePolicyExamples) {
    for (let omitted = 0; omitted < paths.length; omitted += 1) {
      assert.deepEqual(selectCurrentCandidate(paths.filter((_, index) => index !== omitted)), {
        status: "REJECTED", reason: "NO_COMPLETE_PROFILE",
      });
    }
  }
  for (const paths of [
    ["odd/tasks/reporte-ganancia-operaciones-pdf.md"],
    ["src-tauri/src/lib.rs"],
    ["odd/tasks/reporte-ganancia-operaciones-pdf.md", "src-tauri/src/lib.rs"],
    ["src/ui/w9-evidence-audit.test.ts", "odd/tasks/velay-w9-historical-candidates.md"],
  ]) {
    assert.deepEqual(selectCurrentCandidate(paths), { status: "REJECTED", reason: "NO_COMPLETE_PROFILE" });
  }
});

test("W9 current candidate policy rejects mixed subsets and complete R4 with partial Catalog", () => {
  assert.deepEqual(selectCurrentCandidate([
    "src/commands/gross-profit-operations.ts",
    "src/commands/catalog.ts",
    "src-tauri/src/lib.rs",
    "src/ui/w9-evidence-audit.test.ts",
  ]), { status: "REJECTED", reason: "NO_COMPLETE_PROFILE" });
  for (const { paths, owner } of currentCandidatePolicyExamples) {
    const otherTask = owner === "operations"
      ? "odd/tasks/catalog-access-and-profit-report.md"
      : "odd/tasks/reporte-ganancia-operaciones-pdf.md";
    assert.deepEqual(selectCurrentCandidate([...paths, otherTask]), {
      status: "REJECTED", reason: "NO_COMPLETE_PROFILE",
    });
  }
});

test("W9 current candidate policy rejects globally allowlisted extras and its own task record", () => {
  for (const { paths } of currentCandidatePolicyExamples) {
    for (const extra of ["package.json", "odd/tasks/velay-w9-historical-candidates.md", "unrelated.txt"]) {
      assert.deepEqual(selectCurrentCandidate([...paths, extra]), {
        status: "REJECTED", reason: "NO_COMPLETE_PROFILE",
      });
    }
  }
});

test("W9 current candidate policy treats order and duplicates as the acquired normalized set", () => {
  for (const { paths, profile, owner } of currentCandidatePolicyExamples) {
    const acquired = changedPathsFromGitOutput([...paths].reverse().join("\n"), paths.join("\n"));
    assert.deepEqual(acquired, [...paths].sort());
    assert.deepEqual(selectCurrentCandidate(acquired), { status: "SELECTED", profile, owner });
    assert.deepEqual(selectCurrentCandidate([...paths].reverse().concat(paths)), {
      status: "SELECTED", profile, owner,
    });
  }
});

test("W9 current candidate policy resolves whole-set ownership rather than overlapping subsets", () => {
  // The original whole sets are distinct: none can match simultaneously.
  // R3 is contained in R4, but that does not make the complete R4 set ambiguous.
  for (let left = 0; left < currentCandidatePolicyExamples.length; left += 1) {
    for (let right = left + 1; right < currentCandidatePolicyExamples.length; right += 1) {
      const first = currentCandidatePolicyExamples[left];
      const second = currentCandidatePolicyExamples[right];
      assert.notDeepEqual([...first.paths].sort(), [...second.paths].sort());
      const union = [...new Set([...first.paths, ...second.paths])].sort();
      const whole = currentCandidatePolicyExamples.filter(example =>
        example.paths.length === union.length && example.paths.every(path => union.includes(path)));
      assert.ok(whole.length <= 1, "original whole profiles must not be simultaneously identical");
      const expected = whole[0];
      assert.deepEqual(selectCurrentCandidate(union), expected
        ? { status: "SELECTED", profile: expected.profile, owner: expected.owner }
        : { status: "REJECTED", reason: "NO_COMPLETE_PROFILE" });
    }
  }
});

const windowsDesktopFixCandidatePaths = new Set([
  "src-tauri/Cargo.toml",
  "src-tauri/src/commands/backup.rs",
  "src-tauri/src/infrastructure/filesystem/backup_store.rs",
  "src-tauri/src/infrastructure/filesystem/restore_transitions.rs",
  "src-tauri/src/infrastructure/sqlite/backup.rs",
  "src-tauri/src/lib.rs",
  "src-tauri/tests/backup_restore.rs",
  "src/commands/backup.test.ts",
  "src/ui/w9-evidence-audit.test.ts",
  "odd/tasks/windows-desktop-build-fixes.md",
]);

const windowsDesktopFixDiffSha256Allowlist: Record<string, string> = {
  "src-tauri/Cargo.toml": "2cdaf77cce60c185d4fa2e3fe7f5b0c8a97ad4ef39847b5d467189000e0f79b5",
  "src-tauri/src/commands/backup.rs": "7169b1ec4fae68e8e9b08aa8c92011130e9f03e8ad716f2af706fe173166853b",
  "src-tauri/src/infrastructure/filesystem/backup_store.rs": "5c93997017b3b59ac6069207867586788a381df42ac296415cbcf25347b4700c",
  "src-tauri/src/infrastructure/sqlite/backup.rs": "6f3d639a36f312b70af70641a9e3b723a563e02589b8876f791551f37d3eebf1",
  "src-tauri/src/infrastructure/filesystem/restore_transitions.rs": "48e94bec5899ce2826548309281a9fe25d679f165fe47aceb0ca7ab722c8dd9d",
  "src-tauri/src/lib.rs": "e04045f6ab23345b83fc89a19bf12d66df5bfd0a59ab35476eec033f42182ae3",
  "src-tauri/tests/backup_restore.rs": "bfd547aef8a58b83b871dab889922dd7642f4df0ad3d8dd5cfffca6ca4301ab8",
  "src/commands/backup.test.ts": "2e832f565b509c1fe70cc25363153fcad69035a9ffd31e5f9d50fa3cd9110c84",
  "src/ui/w9-evidence-audit.test.ts": "bf0b5d8249a2ddf20e7652f260b93678a20909902b0743e2a87f779a5799940e",
  "odd/tasks/windows-desktop-build-fixes.md": "318ea8070661bb36109050be0cd16a2b4f22ca76043ce57fb80dacc1fe094c53",
};

const backupIntegrityCandidatePaths = new Set([
  "src-tauri/src/lib.rs",
  "src-tauri/src/commands/backup.rs",
  "src-tauri/src/infrastructure/filesystem/backup_store.rs",
  "src-tauri/src/infrastructure/filesystem/restore_transitions.rs",
  "src-tauri/src/infrastructure/sqlite/backup.rs",
  "src-tauri/tests/backup_restore.rs",
  "src/commands/backup.ts",
  "src/commands/backup.test.ts",
  "src/ui/backup/backup-flow.ts",
  "src/ui/backup/backup-flow.test.ts",
  "src/ui/backup/backup-screen.ts",
  "src/ui/backup/backup-screen.mounted.test.ts",
  "src/ui/w9-evidence-audit.test.ts",
  "odd/tasks/backup-restore-integrity-hardening.md",
]);

function assertBackupIntegrityDiffAllowlist(diffs: Record<string, string | Buffer>) {
  for (const [path, content] of Object.entries(diffs)) {
    if (path === "src-tauri/src/lib.rs" && typeof content === "string" && isGrossProfitDesktopFixtureLibDiff(content)) continue;
    if (path === "src-tauri/src/lib.rs" && typeof content === "string" && content.includes("gross_profit_report_command")) {
      assertGrossProfitCommandRegistrationDiff(content);
      continue;
    }
    if (path === "src-tauri/src/lib.rs" && typeof content === "string" && content.includes("onboarding_location_schema_command")) continue;
    const expected = backupIntegrityDiffSha256Allowlist[path];
    assert.ok(expected, `backup-integrity diff is not allowlisted: ${path}`);
    const normalized = typeof content === "string" && path === "src/ui/w9-evidence-audit.test.ts"
      ? content
          .replaceAll(/^index \S+\.\.\S+.*$/gm, "index <SELF_INDEX>")
          .replaceAll(/^([+-])(\s*"src\/ui\/w9-evidence-audit\.test\.ts": ")[^"]+(",)$/gm, '$1$2<SELF_DIFF_SHA256>$3')
          .replaceAll(/^([+-])const catalogAccessUnifiedDiffSha256 = "[^"]+";$/gm, '$1const catalogAccessUnifiedDiffSha256 = "<SELF_CATALOG_HASH>";')
          .replaceAll(/^([+-])const catalogResponsiveTableUnifiedDiffSha256 = "[^"]+";$/gm, '$1const catalogResponsiveTableUnifiedDiffSha256 = "<SELF_HASH>";')
          .replaceAll(/^([+-])const grossProfitReportTaskBytesSha256 = "[^"]*";$/gm, '$1const grossProfitReportTaskBytesSha256 = "<SELF_TASK_HASH>";')
          .replaceAll(/^([+-])const grossProfitReportCandidateDiffSha256 = "[^"]*";$/gm, '$1const grossProfitReportCandidateDiffSha256 = "<SELF_DIFF_HASH>";')
          .replaceAll(/^([+-])const grossProfitOperationsR3TaskBytesSha256 = "[^"]*";$/gm, '$1const grossProfitOperationsR3TaskBytesSha256 = "<SELF_TASK_HASH>";')
          .replaceAll(/^([+-])const grossProfitOperationsR3CandidateDiffSha256 = "[^"]*";$/gm, '$1const grossProfitOperationsR3CandidateDiffSha256 = "<SELF_DIFF_HASH>";')
      : content;
    assert.equal(sha256(normalized), expected, `unexpected backup-integrity diff content: ${path}`);
  }
}

function assertWindowsDesktopFixDiffAllowlist(diffs: Record<string, string | Buffer>) {
  for (const [path, content] of Object.entries(diffs)) {
    if (path === "src-tauri/src/lib.rs" && typeof content === "string" && isGrossProfitDesktopFixtureLibDiff(content)) continue;
    if (path === "src-tauri/src/lib.rs" && typeof content === "string" && content.includes("gross_profit_report_command")) {
      assertGrossProfitCommandRegistrationDiff(content);
      continue;
    }
    if (path === "src-tauri/src/lib.rs" && typeof content === "string" && content.includes("onboarding_location_schema_command")) continue;
    const expected = windowsDesktopFixDiffSha256Allowlist[path];
    assert.ok(expected, `Windows desktop-fix diff is not allowlisted: ${path}`);
    const normalized = typeof content === "string" && path === "src/ui/w9-evidence-audit.test.ts"
      ? content
          .replaceAll(/^index \S+\.\.\S+.*$/gm, "index <SELF_INDEX>")
          .replaceAll(/^([+-])(\s*"src\/ui\/w9-evidence-audit\.test\.ts": ")[^"]+(",)$/gm, '$1$2<SELF_DIFF_SHA256>$3')
          .replaceAll(/^([+-])const catalogAccessUnifiedDiffSha256 = "[^"]+";$/gm, '$1const catalogAccessUnifiedDiffSha256 = "<SELF_CATALOG_HASH>";')
          .replaceAll(/^([+-])const catalogResponsiveTableUnifiedDiffSha256 = "[^"]+";$/gm, '$1const catalogResponsiveTableUnifiedDiffSha256 = "<SELF_HASH>";')
          .replaceAll(/^([+-])const grossProfitReportTaskBytesSha256 = "[^"]*";$/gm, '$1const grossProfitReportTaskBytesSha256 = "<SELF_TASK_HASH>";')
          .replaceAll(/^([+-])const grossProfitReportCandidateDiffSha256 = "[^"]*";$/gm, '$1const grossProfitReportCandidateDiffSha256 = "<SELF_DIFF_HASH>";')
          .replaceAll(/^([+-])const grossProfitOperationsR3TaskBytesSha256 = "[^"]*";$/gm, '$1const grossProfitOperationsR3TaskBytesSha256 = "<SELF_TASK_HASH>";')
          .replaceAll(/^([+-])const grossProfitOperationsR3CandidateDiffSha256 = "[^"]*";$/gm, '$1const grossProfitOperationsR3CandidateDiffSha256 = "<SELF_DIFF_HASH>";')
      : content;
    assert.equal(sha256(normalized), expected, `unexpected Windows desktop-fix diff content: ${path}`);
  }
}

function changedPathsFromGitOutput(trackedChanges: string, untrackedFiles: string): string[] {
  return [...new Set(`${trackedChanges}\n${untrackedFiles}`.split("\n").map((path) => path.trim()).filter(Boolean))].sort();
}

function isTrackedPath(path: string): boolean {
  const trackedPaths = execFileSync(
    "git",
    ["ls-files", "--cached", "-z", "--", `:(literal)${path}`],
    { cwd: root },
  );
  return trackedPaths.length > 0;
}

const preExistingUnrelatedOddTaskBaseline = new Set([
  "odd/tasks/configurable-product-locations.md",
  "odd/tasks/developer-toolchain-rc-upgrade.md",
  "odd/tasks/inventory-pr-delivery.md",
  "odd/tasks/inventory-redesign.md",
  "odd/tasks/product-status-documentation.md",
  "odd/tasks/sales-explicit-product-details.md",
]);

function excludePreExistingUnrelatedOddTaskBaseline(changedPaths: string[]): string[] {
  return changedPaths.filter((path) => !preExistingUnrelatedOddTaskBaseline.has(path));
}

function assertW9ProtectedDiffPolicy(
  changedPaths: string[],
  currentPackageValue: Record<string, any>,
  baselinePackageValue: Record<string, any>,
  currentLockValue: Record<string, any>,
  baselineLockValue: Record<string, any>,
  libDiff: string,
  commandSeamDiff = "",
  capabilityDiff = "",
) {
  const allowedPaths = new Set([
    "package.json",
    "package-lock.json",
    "src-tauri/src/lib.rs",
    "src-tauri/src/commands/backup.rs",
    "src-tauri/src/infrastructure/filesystem/backup_store.rs",
    "src-tauri/src/infrastructure/filesystem/restore_transitions.rs",
    "src-tauri/src/infrastructure/sqlite/backup.rs",
    "src/commands/backup.ts",
    "src/commands/backup.test.ts",
    "src/ui/backup/backup-flow.ts",
    "src/ui/backup/backup-flow.test.ts",
    "src/ui/backup/backup-screen.ts",
    "src/ui/backup/backup-screen.mounted.test.ts",
    "odd/tasks/backup-restore-integrity-hardening.md",
    "src/commands/catalog.ts",
    "src/commands/catalog.test.ts",
    "src-tauri/src/application/catalog/mod.rs",
    "src-tauri/src/application/sales/application_contract.rs",
    "src-tauri/src/commands/confirm_sale.rs",
    "src-tauri/src/infrastructure/sqlite/sale_repository.rs",
    "src/commands/confirm-sale.ts",
    "src/commands/confirm-sale.test.ts",
    "src-tauri/src/application/catalog/access.rs",
    "src-tauri/src/commands/catalog.rs",
    "src-tauri/src/infrastructure/filesystem/catalog_access.rs",
    "src-tauri/src/infrastructure/filesystem/mod.rs",
    "src-tauri/tests/catalog_access.rs",
    "src-tauri/src/domain/catalog.rs",
    "odd/tasks/catalog-access-and-profit-report.md",
    "src-tauri/src/application/mod.rs",
    "src-tauri/src/commands/mod.rs",
    "src-tauri/src/commands/onboarding.rs",
    "src-tauri/tests/product_onboarding.rs",
    "src/commands/onboarding.ts",
    "src-tauri/src/infrastructure/sqlite/mod.rs",
    "src-tauri/src/infrastructure/sqlite/migrations/0016_product_images.sql",
    "src-tauri/src/infrastructure/sqlite/migrations/0021_sale_line_cost_snapshot.sql",
    "src-tauri/src/infrastructure/sqlite/sale_repository.rs",
    "src-tauri/src/infrastructure/sqlite/dashboard_repository.rs",
    "src-tauri/src/application/reporting/mod.rs",
    "src-tauri/src/commands/gross_profit.rs",
    "src-tauri/src/commands/gross_profit_operations.rs",
    "src-tauri/tests/gross_profit_report.rs",
    "src-tauri/tests/gross_profit_operations.rs",
    "src-tauri/tests/gross_profit_operations_export.rs",
    "odd/tasks/reporte-ganancia-operaciones-pdf.md",
    "src/commands/gross-profit.ts",
    "src/commands/gross-profit.test.ts",
    "src/commands/gross-profit-operations.ts",
    "src/commands/gross-profit-operations.test.ts",
    "src/commands/sales-history.ts",
    "src/commands/sales-history.test.ts",
    "src/ui/reports/gross-profit-report-flow.ts",
    "src/ui/reports/gross-profit-report-flow.test.ts",
    "src/ui/reports/gross-profit-report-screen.ts",
    "src/ui/reports/gross-profit-report-screen.mounted.test.ts",
    "src-tauri/tests/dashboard_reporting.rs",
    "src-tauri/tests/sale_cost_snapshot.rs",
    "src-tauri/src/infrastructure/sqlite/migrations/0017_product_image_thumbnails.sql",
    "src-tauri/src/infrastructure/sqlite/migrations/0019_category_field_lifecycle.sql",
    "src-tauri/src/infrastructure/sqlite/migrations/0022_product_low_stock_threshold.sql",
    "src-tauri/src/infrastructure/sqlite/catalog_repository.rs",
    "src-tauri/src/infrastructure/sqlite/inventory_repository.rs",
    "src-tauri/src/domain/inventory.rs",
    "src-tauri/Cargo.lock",
    "src-tauri/Cargo.toml",
    "src-tauri/src/infrastructure/filesystem/backup_store.rs",
    "src-tauri/src/infrastructure/filesystem/restore_transitions.rs",
    "src/commands/backup.test.ts",
    "odd/tasks/windows-desktop-build-fixes.md",
    "src-tauri/src/application/catalog/repository.rs",
    "src-tauri/tests/backup_restore.rs",
    "src-tauri/tests/command_seam.rs",
    "src-tauri/tests/inventory_sale_alerts.rs",
    "src-tauri/tests/catalog_maintenance_application.rs",
    "src-tauri/tests/catalog_maintenance_commands.rs",
    "src-tauri/tests/catalog_maintenance_domain.rs",
    "src-tauri/tests/catalog_maintenance_sqlite.rs",
    "src-tauri/tests/catalog_browse.rs",
    "odd/tasks/reports-movement-ledger.md",
    "src-tauri/capabilities/default.json",
    "src-tauri/src/application/inventory/mod.rs",
    "src-tauri/src/application/inventory/movement_ledger.rs",
    "src-tauri/src/commands/movement_ledger.rs",
    "src-tauri/src/infrastructure/sqlite/movement_ledger_repository.rs",
    "src-tauri/tests/movement_ledger.rs",
    "src-tauri/tests/movement_ledger_commands.rs",
    "src-tauri/tests/movement_ledger_export.rs",
    "src/commands/movement-ledger.ts",
    "src/commands/movement-ledger.test.ts",
    "src/ui/app-shell.ts",
    "src/ui/app.ts",
    "src/ui/reports/movement-ledger-flow.ts",
    "src/ui/reports/movement-ledger-flow.test.ts",
    "src/ui/reports/movement-ledger-screen.ts",
    "src/ui/reports/movement-ledger-screen.mounted.test.ts",
    "src-tauri/tests/post_sale_lifecycle.rs",
    "src-tauri/tests/sqlite_migrations.rs",
    "src/ui/app-shell.mounted.test.ts",
    "src/ui/inventory/inventory-screen.ts",
    "src/commands/onboarding.test.ts",
    "src/commands/dashboard.ts",
    "src/commands/dashboard.test.ts",
    "src/ui/dashboard/dashboard-screen.ts",
    "src/ui/dashboard/dashboard-screen.mounted.test.ts",
    "docs/design/dashboard-figma-handoff.md",
    "src/ui/onboarding/onboarding-form.test.ts",
    "src/ui/onboarding/onboarding-form.ts",
    "src/ui/onboarding/onboarding-flow.test.ts",
    "src/ui/onboarding/onboarding-flow.ts",
    "src/ui/onboarding/onboarding-screen.mounted.test.ts",
    "src/ui/onboarding/onboarding-screen.ts",
    "src/ui/sales/sale-screen.mounted.test.ts",
    "src/ui/sales/sale-screen.ts",
    "src/ui/sales/sale-flow.ts",
    "src/ui/sales/sale-flow.test.ts",
    "odd/tasks/checkout-stock-and-details.md",
    "src/ui/catalog/catalog-maintenance-flow.test.ts",
    "src/ui/catalog/catalog-maintenance-flow.ts",
    "src-tauri/tests/catalog_search.rs",
    "src/ui/catalog/catalog-maintenance-screen.mounted.test.ts",
    "src/ui/catalog/catalog-maintenance-screen.ts",
    "src/ui/visual-system/base-styles.mounted.test.ts",
    "src/ui/catalog/location-management-screen.mounted.test.ts",
    "src/ui/inventory/inventory-screen.mounted.test.ts",
    "src/ui/catalog/product-browser.test.ts",
    "src/ui/catalog/product-browser.ts",
    "src/ui/styles.css",
    "src/ui/visual-system/catalog-edit-dialog.ts",
    "src/ui/visual-system/confirmation-dialog.ts",
    "src/ui/visual-system/catalog-edit-dialog.mounted.test.ts",
    "src/ui/visual-system/location-picker-flow.test.ts",
    "src/ui/visual-system/location-picker-flow.ts",
    "src/ui/visual-system/location-picker.ts",
    "src/ui/w9-evidence-audit.test.ts",
    "odd/tasks/dashboard-realized-gross-profit.md",
    "odd/tasks/dashboard-partial-gross-profit.md",
    "odd/tasks/configurable-low-stock-threshold.md",
  ]);
  const unexpectedPaths = changedPaths.filter((path) => !allowedPaths.has(path));
  assert.deepEqual(unexpectedPaths, [], "unexpected protected-path drift");
  if (changedPaths.includes("src-tauri/tests/command_seam.rs")) {
    assertCommandSeamPricingAllowlist(commandSeamDiff);
  }
  if (changedPaths.includes("src-tauri/capabilities/default.json")) {
    assertReportsCapabilityAllowlist(
      read("src-tauri/capabilities/default.json"),
      readFromHead("src-tauri/capabilities/default.json"),
      capabilityDiff,
    );
  }

  if (changedPaths.includes("package.json") || changedPaths.includes("package-lock.json")) {
    assertTicket14PackageAllowlist(
      currentPackageValue,
      baselinePackageValue,
      currentLockValue,
      baselineLockValue,
    );
  }
  if (changedPaths.includes("src-tauri/src/lib.rs")) {
    if (isGrossProfitDesktopFixtureLibDiff(libDiff)) assert.equal(sha256(libDiff), grossProfitDesktopFixtureLibDiffSha256, "unexpected gross-profit desktop fixture lib.rs diff");
    else if (libDiff.includes("browse_inventory_products_command")) {
      for (const marker of ["onboarding_location_schema_command", "onboarding_list_product_locations_command", "onboarding_assign_product_primary_location_command", "inventory_and_onboarding_operations_work_while_catalog_is_locked_with_safe_inventory_projection", "catalog_access_required"]) assert.match(libDiff, new RegExp(marker));
    }
    else if (libDiff.includes("catalog_access_lock_command")) {
      assert.match(libDiff, /browse_sale_products_command/);
      assert.match(libDiff, /explicit_catalog_lock_clears_the_session/);
      assert.match(libDiff, /sales_browse_and_category_filters_work_while_catalog_is_locked_without_sensitive_facts/);
      assert.match(libDiff, /list_catalog_categories_command/);
    }
    else if (libDiff.includes("catalog_access_status_command")) assert.equal(sha256(libDiff), "06e95cea1eceb4eba7c72e8924ede818364fbd7a63918c6813887fcff6f18ae4", "unexpected Catalog access backend diff");
    else if (libDiff.includes("MovementLedgerProductOptionsRequest")) assertReportsRegistrationAllowlist(libDiff, "product-options");
    else if (libDiff.includes("export_movement_ledger_command")) assertReportsRegistrationAllowlist(libDiff);
    else if (libDiff.includes("edit_category_schema_command")) assertCategorySchemaRegistrationAllowlist(libDiff);
    else if (libDiff.includes("location_schema_command")) assertProductLocationRegistrationAllowlist(libDiff);
    else if (libDiff.includes("choose_product_image_command")) assertCatalogImageRegistrationAllowlist(libDiff);
    else if (libDiff.includes("export_gross_profit_operations_command")) assertGrossProfitPdfExportRegistration(libDiff);
    else if (libDiff.includes("gross_profit_report_command")) assertGrossProfitCommandRegistrationDiff(libDiff);
    else if (libDiff.includes("dashboard_command")) assertDashboardRegistrationAllowlist(libDiff);
    else if (libDiff.includes("browse_products_command") || libDiff.includes("list_catalog_categories_command")) assertCatalogRegistrationAllowlist(libDiff);
    else if (libDiff.includes("Result<commands::backup::BackupDestinationSelection, String>")) assertWindowsPickerCommandDiffAllowlist(libDiff);
    else if (libDiff.includes("backup_diagnostic operation=picker_selection")) assert.equal(sha256(libDiff), "a97fbc06dbcc80d02f0d5bd8dbf5da176bdd6a24a77a3b21ed8debc0c612518e", "unexpected Windows backup-diagnostic diff");
    else if (libDiff.includes("retained_recovery_evidence_is_valid") || libDiff.includes("has_recovery_evidence")) assertBackupRecoveryStartupAllowlist(libDiff);
    else assertTicket11RegistrationAllowlist(libDiff);
  }
}

const currentPackage = parseJson(read("package.json"));
const baselinePackage = parseJson(readFromHead("package.json"));
const currentLock = parseJson(read("package-lock.json"));
const baselineLock = parseJson(readFromHead("package-lock.json"));

const referenceSizes = [
  { width: 1200, height: 800, claim: "authored desktop composition" },
  { width: 960, height: 640, claim: "authored minimum-size reflow" },
] as const;

const mountedSuites = [
  "src/ui/app-shell.mounted.test.ts",
  "src/ui/sales/sale-screen.mounted.test.ts",
  "src/ui/inventory/inventory-screen.mounted.test.ts",
  "src/ui/catalog/catalog-maintenance-screen.mounted.test.ts",
  "src/ui/sales/history-screen.mounted.test.ts",
  "src/ui/onboarding/onboarding-screen.mounted.test.ts",
  "src/ui/backup/backup-screen.mounted.test.ts",
  "src/ui/visual-system/confirmation-dialog.mounted.test.ts",
];

test("W9 records both exact reference sizes without claiming jsdom geometry", () => {
  assert.deepEqual(referenceSizes.map(({ width, height }) => [width, height]), [[1200, 800], [960, 640]]);
  for (const suite of mountedSuites) assert.ok(read(suite).length > 0, `missing mounted evidence suite: ${suite}`);
  assert.match(css, /--size-shell-sidebar:\s*208px/);
  assert.match(css, /@media \(max-width: 960px\)[\s\S]*--size-shell-sidebar:\s*176px/);
  assert.match(css, /@media \(max-width: 960px\)[\s\S]*data-ui-sale-layout[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 960px\)[\s\S]*data-ui-catalog-layout[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 960px\)[\s\S]*data-ui-backup-layout[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 960px\)[\s\S]*data-ui-onboarding-layout[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 960px\)[\s\S]*data-ui-aligned-data[\s\S]*td::before/);
});

test("W9 audits shared accessibility and state seams across every workflow", () => {
  const shell = read("src/ui/app-shell.ts");
  const controls = read("src/ui/visual-system/controls.ts");
  const dialog = read("src/ui/visual-system/confirmation-dialog.ts");
  const history = read("src/ui/sales/history-screen.ts");
  assert.match(shell, /aria-current/);
  assert.match(controls, /role = kind === "error"|role,\n/);
  assert.match(controls, /aria-busy/);
  assert.match(history, /role: "alert"|role=\"alert\"/);
  assert.match(dialog, /role: "dialog"/);
  assert.match(dialog, /aria-modal/);
  assert.match(dialog, /aria-labelledby/);
  assert.match(dialog, /aria-describedby/);
  assert.match(css, /--size-control-default:\s*44px/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /forced-colors: active/);
});

test("W9 audits Spanish presentation, money, whole units, and non-color state cues", () => {
  const workflowFiles = [
    "src/ui/sales/sale-screen.ts",
    "src/ui/inventory/inventory-screen.ts",
    "src/ui/catalog/catalog-maintenance-screen.ts",
    "src/ui/sales/history-screen.ts",
    "src/ui/onboarding/onboarding-screen.ts",
    "src/ui/backup/backup-screen.ts",
  ];
  for (const file of workflowFiles) {
    const source = read(file);
    assert.match(source, /Bs|Venta|Inventario|Catálogo|Historial|Copia|Alta/);
  }
  assert.match(read("src/ui/inventory/inventory-screen.ts"), /Stock bajo: \$\{alert\.quantity\}/);
  assert.match(read("src/ui/inventory/inventory-screen.ts"), /Sin stock: \$\{alert\.quantity\}/);
  assert.match(css, /data-ui-badge/);
  assert.match(css, /font-variant-numeric: tabular-nums/);
  assert.match(read("openspec/changes/archive/2026-09-14-define-frontend-ui-ux-visual-system/design.md"), /contrast[\s\S]*validate/i);
});

test("W9 enforces the named backup-integrity candidate policy and its backend/frontend evidence", () => {
  const backupPaths = [
    "src-tauri/src/commands/backup.rs",
    "src-tauri/src/infrastructure/filesystem/backup_store.rs",
    "src-tauri/src/infrastructure/filesystem/restore_transitions.rs",
    "src-tauri/src/infrastructure/sqlite/backup.rs",
    "src/commands/backup.ts",
    "src/commands/backup.test.ts",
    "src/ui/backup/backup-flow.ts",
    "src/ui/backup/backup-flow.test.ts",
    "src/ui/backup/backup-screen.ts",
    "src/ui/backup/backup-screen.mounted.test.ts",
    "src/ui/w9-evidence-audit.test.ts",
    "odd/tasks/backup-restore-integrity-hardening.md",
  ];
  assert.doesNotThrow(() => assertW9ProtectedDiffPolicy(
    backupPaths,
    currentPackage,
    baselinePackage,
    currentLock,
    baselineLock,
    "",
  ));
  assert.throws(() => assertW9ProtectedDiffPolicy(
    [...backupPaths, "src-tauri/src/commands/unrelated.rs"],
    currentPackage,
    baselinePackage,
    currentLock,
    baselineLock,
    "",
  ), /unexpected protected-path drift/);

  const backend = read("src-tauri/src/commands/backup.rs");
  assert.match(backend, /CleanupResult::DurablyEvidencedFailure => BackupResponse::Created/);
  assert.match(backend, /CleanupResult::UnaccountedFailure => BackupResponse::error\("storage_unavailable"\)/);
  assert.match(backend, /if !reconcile_cleanup_evidence_using\(&snapshot_directory, cleanup\)[\s\S]*?\|\| !prune_artifacts_using\(&snapshot_directory/);
  for (const regression of [
    "create_backup_reconciles_stale_snapshot_evidence_before_pruning",
    "create_backup_reconciliation_failure_retains_snapshot_evidence_and_blocks",
    "create_backup_accepts_an_ordinary_empty_snapshot_directory",
  ]) assert.match(backend, new RegExp(`fn ${regression}\\(`));
  assert.doesNotMatch(backend, /let _ = remove_stage_with_evidence_using/);
  assert.match(backend, /published_backup_with_snapshot_cleanup_failure_returns_created_warning_and_evidence/);
  assert.match(backend, /restore-stage-cleanup-required\\n/);
  const frontend = read("src/commands/backup.ts");
  assert.match(frontend, /cleanup_warning: boolean/);
  assert.match(read("src/ui/backup/backup-flow.ts"), /cleanup_warning \? "La copia fue creada/);
  assert.match(read("odd/tasks/backup-restore-integrity-hardening.md"), /T9 Close Linux cleanup-accounting gaps/);
});

test("W9 binds every changed Windows desktop-fix file and task byte to exact hashes", () => {
  const trackedChanges = execFileSync("git", ["diff", "--name-only", "HEAD"], { cwd: root, encoding: "utf8" });
  const untrackedFiles = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" });
  const changedPaths = changedPathsFromGitOutput(trackedChanges, untrackedFiles);
  const changedCandidates = changedPaths.filter((path) => windowsDesktopFixCandidatePaths.has(path));
  const diffs: Record<string, string | Buffer> = {};
  for (const path of changedCandidates) {
    diffs[path] = isTrackedPath(path)
      ? execFileSync("git", ["diff", "--unified=0", "HEAD", "--", path], { cwd: root, encoding: "utf8" })
      : readFileSync(resolve(root, path));
  }
  assertWindowsDesktopFixDiffAllowlist(diffs);

  const commandBackup = read("src-tauri/src/commands/backup.rs");
  const storeBackup = read("src-tauri/src/infrastructure/filesystem/backup_store.rs");
  const sqliteBackup = read("src-tauri/src/infrastructure/sqlite/backup.rs");
  const lib = read("src-tauri/src/lib.rs");
  assert.match(commandBackup, /CreateFileW[\s\S]*GENERIC_WRITE[\s\S]*FILE_FLAG_BACKUP_SEMANTICS[\s\S]*FlushFileBuffers/);
  assert.match(storeBackup, /CreateFileW[\s\S]*GENERIC_WRITE[\s\S]*FILE_FLAG_BACKUP_SEMANTICS[\s\S]*FlushFileBuffers/);
  for (const source of [commandBackup, storeBackup, sqliteBackup]) {
    assert.match(source, /#\[cfg\(all\(windows, debug_assertions\)\)\][\s\S]*backup_diagnostic operation=/);
  }
  const diagnosticCalls = `${commandBackup}\n${storeBackup}\n${sqliteBackup}`;
  for (const operation of ["snapshot_page_count", "snapshot_page_size", "cleanup_evidence_create", "cleanup_artifact_remove", "cleanup_artifact_directory_sync", "cleanup_reconcile_artifact_remove", "cleanup_reconcile_evidence_directory_sync", "publication_temp_create", "publication_finalize"]) {
    assert.match(diagnosticCalls, new RegExp(`report_backup_(?:sqlite|io|unclassified)_failure\\("${operation}"`));
  }
  const createBackupGateCalls = commandBackup.slice(commandBackup.indexOf("fn create_backup_with_publisher"), commandBackup.indexOf("pub fn prepare_restore"));
  for (const gate of ["expired_prune", "destination_token", "snapshot_prune", "snapshot_size", "snapshot_result", "state_read_snapshot", "publication", "final_cleanup"]) {
    assert.match(createBackupGateCalls, new RegExp(`report_create_backup_gate\\("${gate}"`), `missing create-backup diagnostic gate: ${gate}`);
  }
  assert.match(commandBackup, /#\[cfg\(all\(windows, debug_assertions\)\)\][\s\S]*fn report_create_backup_gate/);
  assert.match(commandBackup, /fn destination_token_class[\s\S]*fn internal_backup_result_class[\s\S]*fn storage_error_class[\s\S]*fn cleanup_result_class/);
  assert.match(read("odd/tasks/windows-desktop-build-fixes.md"), /backup_diagnostic operation=/);
  assert.match(lib, /#\[cfg\(all\(windows, debug_assertions\)\)\][\s\S]*backup_diagnostic operation=picker_selection/);
  assert.match(lib, /backup_diagnostic operation=create_backup_command phase=entry/);
  assert.match(lib, /backup_diagnostic operation=create_backup_response kind=\{kind\} code=\{code\}/);
  assert.match(lib, /fn backup_diagnostic_classification_uses_only_bounded_kinds_and_codes/);
  const candidate = Object.keys(diffs).find((path) => path !== "src/ui/w9-evidence-audit.test.ts" && path !== "src-tauri/src/lib.rs");
  if (candidate) {
    assert.throws(
      () => assertWindowsDesktopFixDiffAllowlist({ ...diffs, [candidate]: `${diffs[candidate]}\\n+arbitrary Windows-fix drift` }),
      /unexpected Windows desktop-fix diff content/,
    );
  }
  assert.throws(
    () => assertWindowsDesktopFixDiffAllowlist({ "src-tauri/Cargo.toml": "+unallowlisted Windows-fix drift" }),
    /unexpected Windows desktop-fix diff content/,
  );
});

test("W9 binds every changed backup-integrity file to its exact unified-zero diff", () => {
  const trackedChanges = execFileSync("git", ["diff", "--name-only", "HEAD"], { cwd: root, encoding: "utf8" });
  const untrackedFiles = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" });
  const changedPaths = changedPathsFromGitOutput(trackedChanges, untrackedFiles);
  const changedCandidates = changedPaths.filter((path) => backupIntegrityCandidatePaths.has(path));
  const diffs: Record<string, string | Buffer> = {};
  for (const path of changedCandidates) {
    diffs[path] = isTrackedPath(path)
      ? execFileSync("git", ["diff", "--unified=0", "HEAD", "--", path], { cwd: root, encoding: "utf8" })
      : readFileSync(resolve(root, path));
  }
  assertBackupIntegrityDiffAllowlist(diffs);
  const candidate = Object.keys(diffs).find((path) => path !== "src/ui/w9-evidence-audit.test.ts" && path !== "src-tauri/src/lib.rs");
  if (candidate) {
    assert.throws(
      () => assertBackupIntegrityDiffAllowlist({ ...diffs, [candidate]: `${diffs[candidate]}\n+arbitrary candidate drift` }),
      /unexpected backup-integrity diff content/,
    );
  }
  assert.throws(
    () => assertBackupIntegrityDiffAllowlist({ "src-tauri/src/commands/backup.rs": "+unallowlisted candidate" }),
    /unexpected backup-integrity diff content/,
  );
});

// Copied from the independently verified immutable source object, not later HEAD.
// This declaration identifies the portable fixture; it does not prove the original
// index state or invocation, and requires no external repository at runtime.
const originalBackupTaskIdentity = {
  path: "odd/tasks/backup-restore-integrity-hardening.md",
  revision: "d055e75d97bdb4bf3160c2065a92ee2a1ac3f1b6",
  blob: "6a4c31d1de3d44efc7c633adca54a6a184cea39c",
};
const readOriginalBackupTask = () => readFileSync(resolve(root, "test/fixtures/w9/backup-restore-integrity-hardening.original.md"));

function assertOriginalBackupTaskEvidence(identity: typeof originalBackupTaskIdentity, contents: Buffer) {
  // Expected identities are independently established origin receipts, not
  // values derived from either the fixture declaration or the current document.
  assert.equal(identity.path, "odd/tasks/backup-restore-integrity-hardening.md", "unexpected historical task source path");
  assert.equal(identity.revision, "d055e75d97bdb4bf3160c2065a92ee2a1ac3f1b6", "unexpected historical task source revision");
  assert.equal(identity.blob, "6a4c31d1de3d44efc7c633adca54a6a184cea39c", "unexpected historical task source blob");
  assertBackupIntegrityDiffAllowlist({ [identity.path]: contents });
  const blob = createHash("sha1").update(`blob ${contents.length}\0`).update(contents).digest("hex");
  assert.equal(blob, identity.blob, "unexpected historical task Git blob bytes");
}

test("W9 preserves the committed backup-integrity task evidence", () => {
  const path = "odd/tasks/backup-restore-integrity-hardening.md";
  assert.equal(isTrackedPath(path), true);
  assert.match(readFromHead(path), /T9 Close Linux cleanup-accounting gaps/);
  const contents = readOriginalBackupTask();
  assert.doesNotThrow(() => assertOriginalBackupTaskEvidence(originalBackupTaskIdentity, contents));
  assert.match(contents.toString("utf8"), /T9 Close Linux cleanup-accounting gaps/);
});

test("W9 historical backup task evidence rejects one-byte alteration", () => {
  const contents = readOriginalBackupTask();
  contents.writeUInt8(contents.readUInt8(0) ^ 1, 0);
  assert.throws(() => assertOriginalBackupTaskEvidence(originalBackupTaskIdentity, contents), /unexpected backup-integrity diff content/);
});

test("W9 historical backup task evidence rejects truncation", () => {
  const contents = readOriginalBackupTask();
  assert.throws(() => assertOriginalBackupTaskEvidence(originalBackupTaskIdentity, contents.subarray(0, -1)), /unexpected backup-integrity diff content/);
});

test("W9 historical backup task evidence rejects wrong source path", () => {
  assert.throws(
    () => assertOriginalBackupTaskEvidence({ ...originalBackupTaskIdentity, path: "test/fixtures/w9/backup-restore-integrity-hardening.original.md" }, readOriginalBackupTask()),
    /unexpected historical task source path/,
  );
});

test("W9 historical backup task evidence rejects wrong source revision", () => {
  assert.throws(
    () => assertOriginalBackupTaskEvidence({ ...originalBackupTaskIdentity, revision: "02b89fa173ebe3f52f9506e626ae5eafd1171103" }, readOriginalBackupTask()),
    /unexpected historical task source revision/,
  );
});

test("W9 historical backup task evidence rejects wrong declared blob", () => {
  assert.throws(
    () => assertOriginalBackupTaskEvidence({ ...originalBackupTaskIdentity, blob: "0000000000000000000000000000000000000000" }, readOriginalBackupTask()),
    /unexpected historical task source blob/,
  );
});

test("W9 historical backup task evidence rejects later document substitution", () => {
  const contents = Buffer.from(readFromHead(originalBackupTaskIdentity.path));
  assert.match(contents.toString("utf8"), /T9 Close Linux cleanup-accounting gaps/);
  assert.throws(() => assertOriginalBackupTaskEvidence(originalBackupTaskIdentity, contents), /unexpected backup-integrity diff content/);
});

test("W9 allows only the bounded owned-Result Windows picker-command diff", () => {
  const allowedDiff = [
    "-    commands: tauri::State<'_, Mutex<commands::backup::BackupCommandState>>,",
    "-) -> commands::backup::BackupDestinationSelection {",
    "+) -> Result<commands::backup::BackupDestinationSelection, String> {",
    "+    let app_handle = window.app_handle().clone();",
    "+    drop(window);",
    "+    let picker_app_handle = app_handle.clone();",
    "-            let _ = window;",
    "+            let _ = picker_app_handle;",
    "-                .app_handle()",
    "+            picker_app_handle",
    "-        return commands::backup::BackupDestinationSelection::Cancelled;",
    "+        return Ok(commands::backup::BackupDestinationSelection::Cancelled);",
    "+    let commands = app_handle.state::<Mutex<commands::backup::BackupCommandState>>();",
    "-        return commands::backup::BackupDestinationSelection::Error {",
    "+        return Ok(commands::backup::BackupDestinationSelection::Error {",
    "-        };",
    "+        });",
    "-    commands.select_backup_destination(path)",
    "+    Ok(commands.select_backup_destination(path))",
    "-    commands: tauri::State<'_, Mutex<commands::backup::BackupCommandState>>,",
    "-) -> commands::backup::RestoreSourceSelection {",
    "+) -> Result<commands::backup::RestoreSourceSelection, String> {",
    "+    let app_handle = window.app_handle().clone();",
    "+    drop(window);",
    "+    let picker_app_handle = app_handle.clone();",
    "-            let _ = window;",
    "+            let _ = picker_app_handle;",
    "-                .app_handle()",
    "+            picker_app_handle",
    "-        return commands::backup::RestoreSourceSelection::Cancelled;",
    "+        return Ok(commands::backup::RestoreSourceSelection::Cancelled);",
    "+    let commands = app_handle.state::<Mutex<commands::backup::BackupCommandState>>();",
    "-        return commands::backup::RestoreSourceSelection::Error {",
    "+        return Ok(commands::backup::RestoreSourceSelection::Error {",
    "-        };",
    "+        });",
    "-    commands.select_restore_source(path)",
    "+    Ok(commands.select_restore_source(path))",
  ].join("\n");
  assert.doesNotThrow(() => assertWindowsPickerCommandDiffAllowlist(allowedDiff));
  assert.throws(
    () => assertWindowsPickerCommandDiffAllowlist(`${allowedDiff}\n+    native_runtime_drift();`),
    /unexpected Windows picker-command diff drift/,
  );
});

test("W9 binds the exact R3 gross-profit operations paths, diff, and task bytes", (t) => {
  const trackedChanges = execFileSync("git", ["diff", "--name-only", "HEAD"], { cwd: root, encoding: "utf8" });
  const untrackedFiles = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" });
  const changedPaths = changedPathsFromGitOutput(trackedChanges, untrackedFiles);
  const selection = selectCurrentCandidate(changedPaths);
  if (selection.status === "NO_CANDIDATE") {
    t.skip("NO_CANDIDATE: no pending candidate; no byte or historical proof");
    return;
  }
  assert.ok(selection.status === "SELECTED", "current candidate rejected: requires exactly one complete owned profile");
  if (selection.owner !== "operations") {
    t.skip(`Owned by Catalog (${selection.profile}); this wrapper supplies no candidate acceptance`);
    return;
  }
  if (selection.profile === "desktop-fixture") {
    const fixtureLibDiff = execFileSync("git", ["diff", "--unified=0", "HEAD", "--", "src-tauri/src/lib.rs"], { cwd: root, encoding: "utf8" });
    assert.ok(isGrossProfitDesktopFixtureLibDiff(fixtureLibDiff), "unexpected desktop fixture lib.rs digest or marker");
    assertGrossProfitDesktopFixtureCandidate(changedPaths, fixtureLibDiff);
    return;
  }
  if (selection.profile === "R4") {
    assertGrossProfitOperationsR4Candidate(changedPaths);
    return;
  }
  assertGrossProfitOperationsR3Candidate(changedPaths);
});

test("W9 binds the exact Catalog access candidate diff and untracked task bytes", (t) => {
  const trackedChanges = execFileSync("git", ["diff", "--name-only", "HEAD"], { cwd: root, encoding: "utf8" });
  const untrackedFiles = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" });
  const changedPaths = changedPathsFromGitOutput(trackedChanges, untrackedFiles);
  const selection = selectCurrentCandidate(changedPaths);
  if (selection.status === "NO_CANDIDATE") {
    t.skip("NO_CANDIDATE: no pending candidate; no byte or historical proof");
    return;
  }
  assert.ok(selection.status === "SELECTED", "current candidate rejected: requires exactly one complete owned profile");
  if (selection.owner !== "catalog") {
    t.skip(`Owned by Operations (${selection.profile}); this wrapper supplies no candidate acceptance`);
    return;
  }
  if (selection.profile === "T3") {
    assertGrossProfitReportCandidate(changedPaths);
    return;
  }
  if (selection.profile === "responsive-table") {
    assert.deepEqual(changedPaths, [...catalogResponsiveTableCandidatePaths].sort());
    const exactDiff = execFileSync("git", ["diff", "--unified=0", "HEAD", "--", ...catalogResponsiveTableCandidatePaths], { cwd: root, encoding: "utf8" });
    const normalizedDiff = exactDiff
      .replaceAll(/^index \S+\.\.\S+.*$/gm, "index <SELF_INDEX>")
      .replaceAll(/^([+-])const catalogResponsiveTableUnifiedDiffSha256 = "[^"]+";$/gm, '$1const catalogResponsiveTableUnifiedDiffSha256 = "<SELF_HASH>";');
    assert.equal(sha256(normalizedDiff), catalogResponsiveTableUnifiedDiffSha256, "unexpected Catalog responsive-table candidate diff");
    return;
  }
  assert.deepEqual(changedPaths, [...catalogAccessCandidatePaths].sort());

  const trackedCandidates = catalogAccessCandidatePaths.filter((path) => isTrackedPath(path));
  const exactDiff = execFileSync("git", ["diff", "--unified=0", "HEAD", "--", ...trackedCandidates], { cwd: root, encoding: "utf8" });
  const normalizedDiff = exactDiff
    .replaceAll(/^index \S+\.\.\S+.*$/gm, "index <SELF_INDEX>")
    .replaceAll(/^([+-])const catalogAccessUnifiedDiffSha256 = "[^"]+";$/gm, '$1const catalogAccessUnifiedDiffSha256 = "<SELF_HASH>";')
    .replaceAll(/^([+-])(\s*"src\/ui\/w9-evidence-audit\.test\.ts": ")[^"]+(",)$/gm, '$1$2<SELF_DIFF_SHA256>$3');
  assert.equal(sha256(normalizedDiff), catalogAccessUnifiedDiffSha256, "unexpected Catalog access candidate diff");

  assert.match(read("odd/tasks/catalog-access-and-profit-report.md"), /Sales remains operational while Catalog is locked/);
  assert.match(read("odd/tasks/catalog-access-and-profit-report.md"), /explicitly chooses "Bloquear catálogo"/);
});

test("W9 allows clean trees, ticket 14 metadata, and the bounded ticket 11 seam", () => {
  const trackedChanges = execFileSync("git", ["diff", "--name-only", "HEAD"], { cwd: root, encoding: "utf8" });
  const untrackedFiles = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" });
  const changedPaths = excludePreExistingUnrelatedOddTaskBaseline(
    changedPathsFromGitOutput(trackedChanges, untrackedFiles),
  );
  const libDiff = execFileSync("git", ["diff", "--unified=0", "HEAD", "--", "src-tauri/src/lib.rs"], { cwd: root, encoding: "utf8" });
  const commandSeamDiff = execFileSync("git", ["diff", "--unified=0", "HEAD", "--", "src-tauri/tests/command_seam.rs"], { cwd: root, encoding: "utf8" });
  const capabilityDiff = execFileSync("git", ["diff", "--unified=0", "HEAD", "--", "src-tauri/capabilities/default.json"], { cwd: root, encoding: "utf8" });
  assertW9ProtectedDiffPolicy(
    changedPaths,
    currentPackage,
    baselinePackage,
    currentLock,
    baselineLock,
    libDiff,
    commandSeamDiff,
    capabilityDiff,
  );
  const uiSources = mountedSuites.map((suite) => read(suite)).join("\n");
  assert.doesNotMatch(uiSources, /https?:\/\/|cdn\.|innerHTML/);
});

test("W9 allows only the diagnosed command-seam pricing contract-test drift", () => {
  const allowedDiff = [
    "-                captured_unit_price_centavos: 4_000,",
    "+                captured_unit_price_centavos: 5_000,",
    "-                final_unit_price_centavos: None,",
    "+                final_unit_price_centavos: Some(5_000),",
    "-                qr_applied_centavos: Some(4_000),",
    "+                qr_applied_centavos: Some(5_000),",
    "-    assert_eq!(summary.lines[0].unit_price_centavos, 4_000);",
    "+    assert_eq!(summary.lines[0].unit_price_centavos, 5_000);",
    "+    assert_eq!(product.purchase_price_centavos, 3_000);",
    "+    assert_eq!(product.sale_price_centavos, 5_000);",
    "+    assert_eq!(product.minimum_sale_price_centavos, 4_000);",
    "+fn onboarded_product_searches_and_sells_at_its_backend_sale_price() {",
  ].join("\n");
  assert.doesNotThrow(() => assertCommandSeamPricingAllowlist(allowedDiff));
  assert.throws(
    () => assertCommandSeamPricingAllowlist(`${allowedDiff}\n+ fn unrelated_runtime_change() { native_runtime_drift(); }`),
    /unexpected command-seam contract-test drift/,
  );
});

test("W9 allows the authorized catalog edit dialog accessible-label test correction", () => {
  assert.doesNotThrow(() => assertW9ProtectedDiffPolicy(
    ["src/ui/visual-system/catalog-edit-dialog.mounted.test.ts"],
    currentPackage,
    baselinePackage,
    currentLock,
    baselineLock,
    "",
  ));
  assert.throws(
    () => assertW9ProtectedDiffPolicy(
      ["src/ui/visual-system/unrelated.mounted.test.ts"],
      currentPackage,
      baselinePackage,
      currentLock,
      baselineLock,
      "",
    ),
    /unexpected protected-path drift/,
  );
});

test("W9 excludes only the fixed unrelated ODD baseline and keeps candidate paths live", () => {
  const baselinePaths = [
    "odd/tasks/configurable-product-locations.md",
    "odd/tasks/developer-toolchain-rc-upgrade.md",
    "odd/tasks/inventory-pr-delivery.md",
    "odd/tasks/inventory-redesign.md",
    "odd/tasks/product-status-documentation.md",
    "odd/tasks/sales-explicit-product-details.md",
  ];
  assert.deepEqual(excludePreExistingUnrelatedOddTaskBaseline(baselinePaths), []);
  assert.deepEqual(
    excludePreExistingUnrelatedOddTaskBaseline([
      ...baselinePaths,
      "odd/tasks/dashboard-realized-gross-profit.md",
      "odd/tasks/new-unrelated-task.md",
    ]),
    ["odd/tasks/dashboard-realized-gross-profit.md", "odd/tasks/new-unrelated-task.md"],
  );
  assert.doesNotThrow(() => assertW9ProtectedDiffPolicy(
    ["odd/tasks/dashboard-realized-gross-profit.md"],
    currentPackage,
    baselinePackage,
    currentLock,
    baselineLock,
    "",
  ));
  assert.throws(
    () => assertW9ProtectedDiffPolicy(
      excludePreExistingUnrelatedOddTaskBaseline(["odd/tasks/new-unrelated-task.md"]),
      currentPackage,
      baselinePackage,
      currentLock,
      baselineLock,
      "",
    ),
    /unexpected protected-path drift/,
  );
});

test("W9 includes untracked paths in the exact protected-path allowlist", () => {
  const intendedUntrackedPaths = changedPathsFromGitOutput(
    "",
    [
      "src-tauri/src/infrastructure/sqlite/migrations/0021_sale_line_cost_snapshot.sql",
      "src-tauri/tests/sale_cost_snapshot.rs",
    ].join("\n"),
  );
  assert.deepEqual(intendedUntrackedPaths, [
    "src-tauri/src/infrastructure/sqlite/migrations/0021_sale_line_cost_snapshot.sql",
    "src-tauri/tests/sale_cost_snapshot.rs",
  ]);
  assert.doesNotThrow(() => assertW9ProtectedDiffPolicy(
    intendedUntrackedPaths,
    currentPackage,
    baselinePackage,
    currentLock,
    baselineLock,
    "",
  ));

  const unrelatedUntrackedPath = changedPathsFromGitOutput("", "src-tauri/tests/unrelated_protected_test.rs");
  assert.throws(
    () => assertW9ProtectedDiffPolicy(
      unrelatedUntrackedPath,
      currentPackage,
      baselinePackage,
      currentLock,
      baselineLock,
      "",
    ),
    /unexpected protected-path drift/,
  );
});

test("W9 rejects arbitrary protected-path and package-lock drift", () => {
  const ticket11Diff = ticket11RegistrationMarkers.map((marker) => `+ ${marker}`).join("\n");
  for (const changedPaths of [
    ["src-tauri/src/main.rs"],
    ["src-tauri/src/application/catalog.rs"],
    ["src-tauri/build.rs"],
    ["src-tauri/src/commands/inventory.rs"],
    ["src/commands/inventory.ts"],
    ["src/ui/unrelated-feature.ts"],
  ]) {
    assert.throws(
      () => assertW9ProtectedDiffPolicy(changedPaths, currentPackage, baselinePackage, currentLock, baselineLock, ticket11Diff),
      /unexpected protected-path drift/,
      changedPaths.join(", "),
    );
  }

  const driftedLock = clone(currentLock);
  driftedLock.packages["node_modules/w9-unapproved-drift"] = { version: "0.0.0" };
  assert.throws(
    () => assertW9ProtectedDiffPolicy(["package-lock.json"], currentPackage, baselinePackage, driftedLock, baselineLock, ""),
    /unexpected package-lock drift/,
  );

  assert.throws(
    () => assertTicket11RegistrationAllowlist("+ fn unrelated_runtime_change() { native_runtime_drift(); }"),
    /missing ticket-11 marker|unexpected src-tauri\/src\/lib\.rs drift/,
  );
});

test("W9 allows only the three authorized low-stock command-seam lines", () => {
  const allowedDiff = [
    "+                captured_unit_price_centavos: 5_000,",
    "+                qr_applied_centavos: Some(5_000),",
    "+    assert_eq!(summary.lines[0].unit_price_centavos, 5_000);",
    "+fn onboarded_product_searches_and_sells_at_its_backend_sale_price() {",
    "+            low_stock_threshold: None,",
    "+            low_stock_threshold: None,",
    String.raw`+        "attribute_values", "available_quantity", "category_id", "category_name", "minimum_sale_price_centavos", "name", "primary_location_code", "product_id", "purchase_price_centavos", "revision", "sale_price_centavos", "sku"`,
  ].join("\n");
  assert.doesNotThrow(() => assertCommandSeamPricingAllowlist(allowedDiff));
  assert.throws(
    () => assertCommandSeamPricingAllowlist(`${allowedDiff}\n+            low_stock_threshold: Some(2),`),
    /unexpected command-seam contract-test drift/,
  );
  assert.throws(
    () => assertW9ProtectedDiffPolicy(
      ["src-tauri/tests/command_seam_unrelated.rs"],
      currentPackage,
      baselinePackage,
      currentLock,
      baselineLock,
      "",
    ),
    /unexpected protected-path drift/,
  );
});

test("W9 allows only the exact configurable low-stock threshold paths", () => {
  const featurePaths = [
    "odd/tasks/configurable-low-stock-threshold.md",
    "src-tauri/src/infrastructure/sqlite/migrations/0022_product_low_stock_threshold.sql",
    "src-tauri/src/domain/inventory.rs",
    "src-tauri/src/infrastructure/sqlite/inventory_repository.rs",
  ];
  for (const changedPath of featurePaths) {
    assert.doesNotThrow(
      () => assertW9ProtectedDiffPolicy([changedPath], currentPackage, baselinePackage, currentLock, baselineLock, ""),
      changedPath,
    );
  }

  assert.doesNotThrow(
    () => assertW9ProtectedDiffPolicy(["src-tauri/tests/inventory_sale_alerts.rs"], currentPackage, baselinePackage, currentLock, baselineLock, ""),
    "src-tauri/tests/inventory_sale_alerts.rs",
  );

  for (const changedPath of [
    "src-tauri/tests/inventory_sale_alert.rs",
    "src-tauri/tests/inventory_sale_alerts_extra.rs",
    "src-tauri/tests/unrelated_inventory_sale_alerts.rs",
    "src-tauri/tests/unrelated_feature.rs",
    "odd/tasks/configurable-low-stock-threshold-related.md",
    "src-tauri/src/infrastructure/sqlite/migrations/0023_product_low_stock_threshold.sql",
    "src-tauri/src/domain/inventory_unrelated.rs",
    "src-tauri/src/infrastructure/sqlite/unrelated_inventory_repository.rs",
  ]) {
    assert.throws(
      () => assertW9ProtectedDiffPolicy([changedPath], currentPackage, baselinePackage, currentLock, baselineLock, ""),
      /unexpected protected-path drift/,
      changedPath,
    );
  }
});

test("W9 allows only the exact Reports Movement Ledger paths", () => {
  const reportsPaths = [
    "odd/tasks/reports-movement-ledger.md",
    "src-tauri/capabilities/default.json",
    "src-tauri/src/application/inventory/mod.rs",
    "src-tauri/src/application/inventory/movement_ledger.rs",
    "src-tauri/src/commands/movement_ledger.rs",
    "src-tauri/src/infrastructure/sqlite/movement_ledger_repository.rs",
    "src-tauri/tests/movement_ledger.rs",
    "src-tauri/tests/movement_ledger_commands.rs",
    "src-tauri/tests/movement_ledger_export.rs",
    "src/commands/movement-ledger.ts",
    "src/commands/movement-ledger.test.ts",
    "src/ui/app-shell.ts",
    "src/ui/app.ts",
    "src/ui/reports/movement-ledger-flow.ts",
    "src/ui/reports/movement-ledger-flow.test.ts",
    "src/ui/reports/movement-ledger-screen.ts",
    "src/ui/reports/movement-ledger-screen.mounted.test.ts",
  ];
  for (const changedPath of reportsPaths) {
    assert.doesNotThrow(
      () => assertW9ProtectedDiffPolicy(
        [changedPath], currentPackage, baselinePackage, currentLock, baselineLock, "", "",
        "",
      ),
      changedPath,
    );
  }

  for (const changedPath of [
    "src-tauri/capabilities/other.json",
    "src-tauri/capabilities",
    "odd/tasks/reports-movement-ledger-related.md",
    "odd/tasks/unrelated-reports.md",
    "src-tauri/src/application/inventory/other_ledger.rs",
    "src-tauri/src/commands/movement_ledger_extra.rs",
    "src-tauri/tests/movement_ledger_extra.rs",
    "src/ui/reports/unrelated-report.ts",
    "src-tauri/src/application/inventory",
    "src-tauri/src/commands",
    "src-tauri/tests",
    "src/ui/reports",
    "odd/tasks",
  ]) {
    assert.throws(
      () => assertW9ProtectedDiffPolicy([changedPath], currentPackage, baselinePackage, currentLock, baselineLock, ""),
      /unexpected protected-path drift/,
      changedPath,
    );
  }
});

test("W9 validates the Reports capability addition against its explicit pre-Reports baseline", () => {
  const committedBaseline = parseJson(readFromHead("src-tauri/capabilities/default.json"));
  const baseline = JSON.stringify({
    ...committedBaseline,
    permissions: committedBaseline.permissions.filter((permission: string) => permission !== "dialog:allow-save"),
  }, null, 2);
  const current = readFromHead("src-tauri/capabilities/default.json");
  const allowedDiff = [
    '-  "permissions": ["core:default", "dialog:allow-open"]',
    '+  "permissions": ["core:default", "dialog:allow-open", "dialog:allow-save"]',
  ].join("\n");
  assert.doesNotThrow(() => assertReportsCapabilityAllowlist(current, baseline, allowedDiff));

  for (const [changedCurrent, changedDiff] of [
    [baseline, allowedDiff],
    [current.replace("dialog:allow-open", "dialog:allow-open-extra"), allowedDiff],
    [current.replace("\"dialog:allow-save\"]", "\"dialog:allow-save\", \"dialog:allow-close\"]"), allowedDiff],
    [current.replace("\"core:default\", \"dialog:allow-open\"", "\"dialog:allow-open\", \"core:default\""), allowedDiff],
    [current, `${allowedDiff}\n-  \"description\": \"Main window permissions for native backup and restore dialogs.\"\n+  \"description\": \"Changed unrelated description.\"`],
    [current, `${allowedDiff}\n-  \"description\": \"Main window permissions for native backup and restore dialogs.\"\n+  \"windows\": [\"main\"]\n-  \"windows\": [\"main\"]\n+  \"description\": \"Main window permissions for native backup and restore dialogs.\"`],
    [current, `${allowedDiff}\n+  \"extra\": true`],
  ] as const) {
    assert.throws(
      () => assertReportsCapabilityAllowlist(changedCurrent, baseline, changedDiff),
      /Reports may only append|unexpected Reports capability diff/,
    );
  }

  assert.doesNotThrow(() => assertReportsCapabilityAllowlist(
    read("src-tauri/capabilities/default.json"),
    current,
    "",
  ));
  assert.throws(
    () => assertReportsCapabilityAllowlist(
      current.replace("dialog:allow-save", "dialog:allow-save-extra"),
      current,
      '+  "permissions": ["core:default", "dialog:allow-open", "dialog:allow-save-extra"]',
    ),
    /unexpected uncommitted Reports capability drift/,
  );
});

test("W9 allows only the repaired async Reports export command shape", () => {
  const allowedDiff = [
    "+ list_movement_ledger_command,",
    "+ list_movement_ledger_product_options_command,",
    "+ export_movement_ledger_command,",
    "+ app_handle: tauri::AppHandle<R>,",
    "+ ) -> Result<commands::movement_ledger::MovementLedgerExportResponse, String> {",
    "+ let _ = (app_handle, request);",
    "+ Ok(commands::movement_ledger::MovementLedgerExportResponse::Cancelled)",
    "+ let state = app_handle.state::<AppState>();",
    "+ let response = state.with_read(|connection| Ok(commands::movement_ledger::export_movement_ledger(",
    "+ return Ok(commands::movement_ledger::MovementLedgerExportResponse::Cancelled);",
    "+ Ok(response)",
    "- state: tauri::State<'_, AppState>,",
    "- window: tauri::WebviewWindow<R>,",
    "- ) -> commands::movement_ledger::MovementLedgerExportResponse {",
    "- let _ = (state, window, request);",
    "- commands::movement_ledger::MovementLedgerExportResponse::Cancelled",
    "- return commands::movement_ledger::MovementLedgerExportResponse::Cancelled;",
    "- let app_handle = window.app_handle().clone();",
    "- drop(window);",
    "- state.with_read(|connection| Ok(commands::movement_ledger::export_movement_ledger(",
    "- ))",
  ].join("\n");
  assert.doesNotThrow(() => assertReportsRegistrationAllowlist(allowedDiff));
  for (const invalidLine of [
    "+ state: tauri::State<'_, AppState>,",
    "+ window: tauri::WebviewWindow<R>,",
    "+ ) -> commands::movement_ledger::MovementLedgerExportResponse {",
    "+ unrelated_reports_command,",
    "+ state.with_write(|connection| mutate_reports(connection))",
    "+ fn unrelated_runtime_change() { native_runtime_drift(); }",
  ]) {
    assert.throws(
      () => assertReportsRegistrationAllowlist(`${allowedDiff}\n${invalidLine}`),
      /unexpected Reports command registration drift/,
      invalidLine,
    );
  }
});

test("W9 routes the bounded Reports product-options wrapper to its narrow validator", () => {
  const boundedProductOptionsDiff = [
    "+ request: commands::movement_ledger::MovementLedgerProductOptionsRequest,",
    "+ state.with_read(|connection| Ok(commands::movement_ledger::list_movement_ledger_product_options(connection, request)))",
    "- state.with_read(|connection| Ok(commands::movement_ledger::list_movement_ledger_product_options(connection)))",
  ].join("\n");
  assert.match(boundedProductOptionsDiff, /MovementLedgerProductOptionsRequest/);
  assert.doesNotThrow(() => assertReportsRegistrationAllowlist(boundedProductOptionsDiff, "product-options"));
  for (const invalidLine of [
    "+ request: commands::catalog::BrowseProductsRequest,",
    "+ page_size: u32,",
    "+ state.with_write(|connection| mutate_reports(connection))",
  ]) {
    assert.throws(
      () => assertReportsRegistrationAllowlist(`${boundedProductOptionsDiff}\n${invalidLine}`, "product-options"),
      /unexpected Reports command registration drift/,
      invalidLine,
    );
  }
  assert.throws(
    () => assertReportsRegistrationAllowlist(boundedProductOptionsDiff, "export"),
    /missing Reports export command marker/,
  );
});

test("W9 allows only the exact Dashboard and gross-profit paths", () => {
  const dashboardPaths = [
    "src-tauri/src/application/mod.rs",
    "src-tauri/src/commands/mod.rs",
    "src-tauri/src/infrastructure/sqlite/mod.rs",
    "src-tauri/src/application/reporting/mod.rs",
    "src-tauri/src/infrastructure/sqlite/dashboard_repository.rs",
    "src-tauri/src/infrastructure/sqlite/sale_repository.rs",
    "src-tauri/src/infrastructure/sqlite/migrations/0021_sale_line_cost_snapshot.sql",
    "src-tauri/tests/dashboard_reporting.rs",
    "src-tauri/tests/sale_cost_snapshot.rs",
    "src/commands/dashboard.ts",
    "src/commands/dashboard.test.ts",
    "src/ui/dashboard/dashboard-screen.ts",
    "src/ui/dashboard/dashboard-screen.mounted.test.ts",
    "docs/design/dashboard-figma-handoff.md",
    "odd/tasks/dashboard-partial-gross-profit.md",
  ];
  for (const changedPath of dashboardPaths) {
    assert.doesNotThrow(
      () => assertW9ProtectedDiffPolicy([changedPath], currentPackage, baselinePackage, currentLock, baselineLock, ""),
      changedPath,
    );
  }

  for (const changedPath of [
    "src-tauri/src/application/reporting/other_report.rs",
    "src-tauri/src/commands/unrelated_dashboard.rs",
    "src-tauri/src/infrastructure/sqlite/other_dashboard_repository.rs",
    "src-tauri/src/infrastructure/sqlite/migrations/0022_unrelated.sql",
    "odd/tasks/dashboard-partial-gross-profit-related.md",
    "odd/tasks/unrelated-dashboard-partial-gross-profit.md",
    "src-tauri/src/infrastructure/sqlite/migrations/0018_unrelated.sql",
    "src-tauri/src/infrastructure/sqlite/another_repository.rs",
    "src-tauri/tests/catalog_images.rs",
    "src-tauri/src/application",
    "src-tauri/src/commands",
    "src-tauri/src/infrastructure/sqlite",
  ]) {
    assert.throws(
      () => assertW9ProtectedDiffPolicy(
        [changedPath],
        currentPackage,
        baselinePackage,
        currentLock,
        baselineLock,
        "",
      ),
      /unexpected protected-path drift/,
      changedPath,
    );
  }
});

test("W9 parses Catalog registration diffs by actual newline and rejects unrelated drift", () => {
  const allowedCatalogDiff = [
    "+ browse_products_command,",
    "+ list_catalog_categories_command,",
  ].join("\n");
  assert.doesNotThrow(() => assertCatalogRegistrationAllowlist(allowedCatalogDiff));
  assert.throws(
    () => assertCatalogRegistrationAllowlist(`${allowedCatalogDiff}\n+ fn unrelated_catalog_runtime_change() { native_runtime_drift(); }`),
    /unexpected Catalog command registration drift/,
  );
});

test("W9 allows only the diagnosed Catalog image paths and rejects unrelated paths", () => {
  const catalogImagePaths = [
    "src-tauri/src/infrastructure/sqlite/migrations/0016_product_images.sql",
    "src-tauri/src/infrastructure/sqlite/migrations/0017_product_image_thumbnails.sql",
    "src-tauri/src/application/catalog/mod.rs",
    "src-tauri/src/infrastructure/sqlite/catalog_repository.rs",
  ];
  for (const changedPath of catalogImagePaths) {
    assert.doesNotThrow(
      () => assertW9ProtectedDiffPolicy([changedPath], currentPackage, baselinePackage, currentLock, baselineLock, ""),
      changedPath,
    );
  }

  for (const changedPath of [
    "src-tauri/src/infrastructure/sqlite/migrations/0018_unrelated.sql",
    "src-tauri/src/infrastructure/sqlite/another_repository.rs",
    "src-tauri/tests/catalog_images.rs",
  ]) {
    assert.throws(
      () => assertW9ProtectedDiffPolicy([changedPath], currentPackage, baselinePackage, currentLock, baselineLock, ""),
      /unexpected protected-path drift/,
      changedPath,
    );
  }
});

test("W9 allows only the exact Dashboard command registration diff", () => {
  const allowedDashboardDiff = [
    "+ dashboard_command,",
    '+#[cfg(feature = "desktop")]',
    "+#[tauri::command]",
    "+fn dashboard_command(",
    "+    state: tauri::State<AppState>,",
    "+    request: commands::dashboard::DashboardRequest,",
    "+) -> commands::dashboard::DashboardResponse {",
    "+    state",
    "+        .with_read(|connection| Ok(commands::dashboard::dashboard(connection, request)))",
    "+        .unwrap_or_else(|_| commands::dashboard::DashboardResponse::Error(commands::dashboard::persistence_failure()))",
    "+}",
    "+    #[test]",
    "+    fn registers_read_only_dashboard_command_at_the_tauri_command_seam() {",
    "+        let (app, window) = test_window();",
    "+        let before = app.state::<AppState>().with_read(|connection| Ok(snapshot(connection))).unwrap();",
    "+        assert!(get_ipc_response(&window, request_with(\"dashboard_command\", serde_json::json!({",
    '+            "today_from_utc": "2024-03-10T05:00:00Z",',
    '+            "today_to_exclusive_utc": "2024-03-11T04:00:00Z",',
    '+            "month_from_utc": "2024-03-01T05:00:00Z",',
    '+            "month_to_exclusive_utc": "2024-04-01T04:00:00Z"',
    "+        }))).is_ok());",
    "+        assert_eq!(app.state::<AppState>().with_read(|connection| Ok(snapshot(connection))).unwrap(), before);",
    "+    }",
  ].join("\n");
  assert.doesNotThrow(() => assertDashboardRegistrationAllowlist(allowedDashboardDiff));
  assert.throws(
    () => assertDashboardRegistrationAllowlist(`${allowedDashboardDiff}\n+ fn dashboard_runtime_change() { native_runtime_drift(); }`),
    /unexpected Dashboard command registration drift/,
  );
});

test("W9 allows only the exact Sales screen path for checkout thumbnail caching", () => {
  assert.doesNotThrow(() => assertW9ProtectedDiffPolicy(
    ["src/ui/sales/sale-screen.ts"],
    currentPackage,
    baselinePackage,
    currentLock,
    baselineLock,
    "",
  ));
  for (const nearPath of [
    "src/ui/sales/sale-screen-extra.ts",
    "src/ui/sales/sale-screen.test.ts",
    "src/ui/sales/sale-screen.mounted.extra.test.ts",
  ]) {
    assert.throws(
      () => assertW9ProtectedDiffPolicy([nearPath], currentPackage, baselinePackage, currentLock, baselineLock, ""),
      /unexpected protected-path drift/,
      nearPath,
    );
  }
});

test("W9 allows only the exact checkout feature paths and rejects nearby paths", () => {
  const checkoutPaths = [
    "odd/tasks/checkout-stock-and-details.md",
    "src/ui/sales/sale-flow.ts",
    "src/ui/sales/sale-flow.test.ts",
  ];
  for (const path of checkoutPaths) {
    assert.doesNotThrow(
      () => assertW9ProtectedDiffPolicy([path], currentPackage, baselinePackage, currentLock, baselineLock, ""),
      path,
    );
  }

  for (const nearPath of [
    "odd/tasks/checkout-stock-and-details-related.md",
    "odd/tasks/unrelated-checkout-stock-and-details.md",
    "src/ui/sales/sale-flow-extra.ts",
    "src/ui/sales/sale-flow.test-extra.ts",
    "src/ui/sales/sale-flow.unrelated.test.ts",
  ]) {
    assert.throws(
      () => assertW9ProtectedDiffPolicy([nearPath], currentPackage, baselinePackage, currentLock, baselineLock, ""),
      /unexpected protected-path drift/,
      nearPath,
    );
  }
});

test("W9 rejects appended text adjacent to an allowed ticket 11 marker", () => {
  const allowedRegistrationDiff = [
    "+ fn command_builder<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {",
    "+ command_builder(builder.plugin(tauri_plugin_dialog::init()))",
    "+ choose_backup_destination_command,",
    "+ choose_restore_source_command,",
    "+ create_backup_command,",
    "+ prepare_restore_command,",
    "+ confirm_restore_command",
  ].join("\n");
  assert.doesNotThrow(() => assertTicket11RegistrationAllowlist(allowedRegistrationDiff));
  assert.throws(
    () => assertTicket11RegistrationAllowlist(
      `${allowedRegistrationDiff}\n+ choose_backup_destination_command, // arbitrary appended production text`,
    ),
    /unexpected src-tauri\/src\/lib\.rs drift/,
  );

  const allowedCatalogImageDiff = [
    "+ choose_product_image_command,",
    "+ remove_product_image_command,",
    "+ catalog_product_image_thumbnail_command,",
  ].join("\n");
  assert.doesNotThrow(() => assertCatalogImageRegistrationAllowlist(allowedCatalogImageDiff));
  assert.throws(
    () => assertCatalogImageRegistrationAllowlist(`${allowedCatalogImageDiff}\n+ fn unrelated_catalog_runtime_change() { native_runtime_drift(); }`),
    /unexpected Catalog image command registration drift/,
  );
});

test("W9 allows only the exact general-test exclusion and dedicated audit scripts", () => {
  assert.equal(currentPackage.scripts.test, "tsx --test --import ./test/react-dom.ts $(find src \\( -name '*.test.js' -o -name '*.test.ts' \\) ! -path 'src/ui/w9-evidence-audit.test.ts')");
  assert.equal(currentPackage.scripts["test:w9"], "tsx --test src/ui/w9-evidence-audit.test.ts");
  const allowedPackage = clone(baselinePackage);
  allowedPackage.scripts["typecheck:tests"] = "tsc --project tsconfig.tests.json --noEmit";
  allowedPackage.scripts.test = "tsx --test --import ./test/react-dom.ts $(find src \\( -name '*.test.js' -o -name '*.test.ts' \\) ! -path 'src/ui/w9-evidence-audit.test.ts')";
  allowedPackage.scripts["test:w9"] = "tsx --test src/ui/w9-evidence-audit.test.ts";
  allowedPackage.devDependencies["@types/jsdom"] = "^30.0.0";
  assert.doesNotThrow(() => assertTicket14PackageAllowlist(allowedPackage, baselinePackage, currentLock, baselineLock));

  for (const drift of [
    (packageJson: Record<string, any>) => { packageJson.dependencies.react = "^18.3.2"; },
    (packageJson: Record<string, any>) => { packageJson.scripts.build = "vite --mode unexpected-drift"; },
    (packageJson: Record<string, any>) => { packageJson.scripts.test += " --unexpected"; },
    (packageJson: Record<string, any>) => { packageJson.scripts["test:w9"] = "tsx --test --import ./test/react-dom.ts src/ui/w9-evidence-audit.test.ts"; },
    (packageJson: Record<string, any>) => { packageJson.scripts.unapproved = "echo drift"; },
  ]) {
    const driftedPackage = clone(allowedPackage);
    drift(driftedPackage);
    assert.throws(
      () => assertTicket14PackageAllowlist(driftedPackage, baselinePackage, currentLock, baselineLock),
    );
  }
});

// Historical material identity only: no live candidate or execution approval.
function historicalR3Record(
  value: unknown, keys: readonly string[], label: string,
): asserts value is Record<string, unknown> {
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value), `${label}: expected object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label}: unexpected fields`);
}

function historicalR3Chunks(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((chunk: unknown) =>
    typeof chunk === "string" && Buffer.from(chunk, "utf8").toString("utf8") === chunk);
}

// Independent original declarations, not hashes learned from fixture metadata.
const historicalR3TaskSha256 = "f9fbe3f3055903382ab8c25dd74d92488ea68e3e46757cb4b9ad01d4e4865c98";
const historicalR3PayloadSha256 = "d18c074173b55dbce142559d10486f4fa25aaa88d546955ccd48187276eea060";
const historicalR3OrderedPaths = [
  "odd/tasks/reporte-ganancia-operaciones-pdf.md",
  "src/commands/gross-profit-operations.ts",
  "src/commands/gross-profit-operations.test.ts",
  "src/ui/reports/gross-profit-report-flow.ts",
  "src/ui/reports/gross-profit-report-flow.test.ts",
  "src/ui/reports/gross-profit-report-screen.ts",
  "src/ui/reports/gross-profit-report-screen.mounted.test.ts",
  "src/ui/w9-evidence-audit.test.ts",
];

function assertHistoricalR3Material(value: unknown): void {
  historicalR3Record(value, ["profile", "provenance", "candidate", "candidateTree", "parentBaseline", "trackingMap", "sourceAuditBlob", "task", "payload"], "material");
  assert.equal(value.profile, "gross-profit-operations-r3", "profile identity");
  assert.equal(value.provenance, "DERIVED", "material provenance");
  assert.equal(value.candidate, "219c890e5db3bd5de6aa66dfe5fc60ffeef46435", "candidate identity");
  assert.equal(value.candidateTree, "645f26249e75eb541b956e4eee129d0087a96369", "candidate tree identity");
  historicalR3Record(value.parentBaseline, ["provenance", "revision"], "parent baseline");
  assert.equal(value.parentBaseline.provenance, "DERIVED", "parent baseline provenance");
  assert.equal(value.parentBaseline.revision, "f303b3d470ae3db342390886cbdab1187263b59b", "parent baseline identity");
  historicalR3Record(value.trackingMap, ["provenance", "basis"], "tracking map");
  assert.equal(value.trackingMap.provenance, "DERIVED", "tracking map provenance");
  assert.equal(value.trackingMap.basis, "parent-tree-membership", "tracking map basis");
  assert.equal(value.sourceAuditBlob, "90a4800e7712efd0638492440695e6729e8b8e60", "source audit identity");
  historicalR3Record(value.task, ["path", "blob", "bytes", "sha256", "chunks"], "task");
  assert.equal(value.task.path, historicalR3OrderedPaths[0], "task source path");
  assert.equal(value.task.blob, "67e1d4fa0fa266d5f68961046b42968ff9890f9b", "task source blob");
  assert.equal(value.task.bytes, 2961, "task declared length");
  assert.equal(value.task.sha256, historicalR3TaskSha256, "task declared digest");
  assert.ok(historicalR3Chunks(value.task.chunks), "task: expected UTF-8 string chunks");
  const taskBytes = Buffer.from(value.task.chunks.join(""), "utf8");
  assert.equal(taskBytes.length, 2961, "task byte length");
  assert.equal(createHash("sha256").update(taskBytes).digest("hex"), historicalR3TaskSha256, "task byte digest");
  assert.equal(createHash("sha1").update(`blob ${taskBytes.length}\0`).update(taskBytes).digest("hex"), "67e1d4fa0fa266d5f68961046b42968ff9890f9b", "task Git blob identity");
  historicalR3Record(value.payload, ["bytes", "sha256", "entries"], "payload");
  assert.equal(value.payload.bytes, 50757, "payload declared length");
  assert.equal(value.payload.sha256, historicalR3PayloadSha256, "payload declared digest");
  assert.ok(Array.isArray(value.payload.entries), "payload: expected entries");
  assert.equal(value.payload.entries.length, 8, "payload path count");
  const representations = value.payload.entries.map((entry: unknown, index: number) => {
    historicalR3Record(entry, ["path", "kind", "chunks"], "entry");
    assert.equal(entry.path, historicalR3OrderedPaths[index], "payload path order");
    assert.equal(entry.kind, ["D", "F", "F", "F", "F", "D", "D", "D"][index], "representation kind");
    assert.ok(historicalR3Chunks(entry.chunks), "entry: expected UTF-8 string chunks");
    // Already normalized historical representations: no trimming or renormalization.
    return `${entry.path}\0${entry.chunks.join("")}`;
  });
  const payloadBytes = Buffer.from(representations.join("\0"), "utf8");
  assert.equal(payloadBytes.length, 50757, "payload byte length");
  assert.equal(createHash("sha256").update(payloadBytes).digest("hex"), historicalR3PayloadSha256, "payload byte digest");
}

function readHistoricalR3Material(): unknown {
  return JSON.parse(read("test/fixtures/w9/gross-profit-operations-r3.derived.json"));
}

test("W9 historical R3 material accepts exact derived evidence", () => {
  assert.doesNotThrow(() => assertHistoricalR3Material(readHistoricalR3Material()));
});

// Fresh decoded values for each tamper attempt, never shared fixture state.
function historicalR3Mutation() {
  const material = readHistoricalR3Material();
  historicalR3Record(material, ["profile", "provenance", "candidate", "candidateTree", "parentBaseline", "trackingMap", "sourceAuditBlob", "task", "payload"], "test material");
  historicalR3Record(material.task, ["path", "blob", "bytes", "sha256", "chunks"], "test task");
  historicalR3Record(material.payload, ["bytes", "sha256", "entries"], "test payload");
  historicalR3Record(material.parentBaseline, ["provenance", "revision"], "test parent");
  historicalR3Record(material.trackingMap, ["provenance", "basis"], "test tracking map");
  assert.ok(historicalR3Chunks(material.task.chunks));
  assert.ok(Array.isArray(material.payload.entries));
  const entries = material.payload.entries.map((entry: unknown) => {
    historicalR3Record(entry, ["path", "kind", "chunks"], "test entry");
    assert.ok(historicalR3Chunks(entry.chunks));
    return { record: entry, chunks: entry.chunks };
  });
  return { material, task: material.task, taskChunks: material.task.chunks,
    payload: material.payload, entries, parent: material.parentBaseline, tracking: material.trackingMap };
}

test("W9 historical R3 material rejects same-length task byte tampering", () => {
  const value = historicalR3Mutation();
  value.taskChunks[0] = value.taskChunks[0].replace("#", "!");
  assert.throws(() => assertHistoricalR3Material(value.material), /task byte digest/);
});

test("W9 historical R3 material rejects payload byte tampering without renormalizing", () => {
  for (const index of [1, 7]) {
    const value = historicalR3Mutation();
    const chunk = value.entries[index].chunks[0];
    value.entries[index].chunks[0] = `${chunk[0] === "!" ? "?" : "!"}${chunk.slice(1)}`;
    assert.throws(() => assertHistoricalR3Material(value.material), /payload byte digest/);
  }
  const value = historicalR3Mutation();
  value.entries[7].record.chunks = value.entries[7].chunks.join("").replace("<SELF_INDEX>", "<SELF_OTHER>").split(/(?<=\n)/);
  assert.throws(() => assertHistoricalR3Material(value.material), /payload byte digest/);
});

test("W9 historical R3 material rejects truncation and newline changes", () => {
  const mutations = [
    (body: string) => body.slice(0, -1),
    (body: string) => `${body}\n`,
    (body: string) => body.replaceAll("\n", "\r\n"),
    (body: string) => body.replace("\n", "\r"),
  ];
  for (const mutate of mutations) {
    const taskValue = historicalR3Mutation();
    taskValue.task.chunks = [mutate(taskValue.taskChunks.join(""))];
    assert.throws(() => assertHistoricalR3Material(taskValue.material), /task byte (length|digest)/);
    for (let index = 0; index < 8; index += 1) {
      const value = historicalR3Mutation();
      value.entries[index].record.chunks = [mutate(value.entries[index].chunks.join(""))];
      assert.throws(() => assertHistoricalR3Material(value.material), /payload byte (length|digest)/);
    }
  }
});

test("W9 historical R3 material rejects missing extra reordered and substituted paths", () => {
  for (let index = 0; index < 8; index += 1) {
    const missing = historicalR3Mutation();
    missing.payload.entries = missing.entries.filter((_, position) => position !== index).map(entry => entry.record);
    assert.throws(() => assertHistoricalR3Material(missing.material), /payload path count/);
    const changed = historicalR3Mutation();
    changed.entries[index].record.path = `./${changed.entries[index].record.path}`;
    assert.throws(() => assertHistoricalR3Material(changed.material), /payload path order/);
  }
  const extra = historicalR3Mutation();
  extra.payload.entries = [...extra.entries.map(entry => entry.record), extra.entries[0].record];
  assert.throws(() => assertHistoricalR3Material(extra.material), /payload path count/);
  const reversed = historicalR3Mutation();
  reversed.payload.entries = reversed.entries.map(entry => entry.record).reverse();
  assert.throws(() => assertHistoricalR3Material(reversed.material), /payload path order/);
  const duplicate = historicalR3Mutation();
  duplicate.entries[1].record.path = duplicate.entries[0].record.path;
  assert.throws(() => assertHistoricalR3Material(duplicate.material), /payload path order/);
});

test("W9 historical R3 material binds profile revisions provenance and source identities", () => {
  const rootChanges: [string, unknown, RegExp][] = [
    ["profile", "gross-profit-operations-r4", /profile identity/],
    ["provenance", "ORIGINAL_EXECUTION", /material provenance/],
    ["candidate", "0000000000000000000000000000000000000000", /candidate identity/],
    ["candidateTree", "0000000000000000000000000000000000000000", /candidate tree identity/],
    ["sourceAuditBlob", "0000000000000000000000000000000000000000", /source audit identity/],
  ];
  for (const [key, replacement, rejection] of rootChanges) {
    const value = historicalR3Mutation();
    value.material[key] = replacement;
    assert.throws(() => assertHistoricalR3Material(value.material), rejection);
  }
  const nestedChanges: ["parent" | "tracking" | "task" | "payload", string, unknown, RegExp][] = [
    ["parent", "revision", "0000000000000000000000000000000000000000", /parent baseline identity/],
    ["parent", "provenance", "ORIGINAL_HEAD", /parent baseline provenance/],
    ["tracking", "provenance", "ORIGINAL_INDEX", /tracking map provenance/],
    ["tracking", "basis", "current-index", /tracking map basis/],
    ["task", "path", "odd/tasks/substituted.md", /task source path/],
    ["task", "blob", "0000000000000000000000000000000000000000", /task source blob/],
    ["task", "bytes", "2961", /task declared length/],
    ["task", "sha256", "0".repeat(64), /task declared digest/],
    ["payload", "bytes", "50757", /payload declared length/],
    ["payload", "sha256", "0".repeat(64), /payload declared digest/],
  ];
  for (const [target, key, replacement, rejection] of nestedChanges) {
    const value = historicalR3Mutation();
    value[target][key] = replacement;
    assert.throws(() => assertHistoricalR3Material(value.material), rejection);
  }
});

test("W9 historical R3 material rejects changed D-F representation classifications", () => {
  for (let index = 0; index < 8; index += 1) {
    const value = historicalR3Mutation();
    value.entries[index].record.kind = value.entries[index].record.kind === "D" ? "F" : "D";
    assert.throws(() => assertHistoricalR3Material(value.material), /representation kind/);
  }
});

test("W9 historical R3 material rejects unknown and missing fields at every schema level", () => {
  for (let index = 0; index < 13; index += 1) {
    for (const action of ["extra", "missing"]) {
      const value = historicalR3Mutation();
      const records = [value.material, value.parent, value.tracking, value.task, value.payload,
        ...value.entries.map(entry => entry.record)];
      const target = records[index];
      if (action === "extra") target.untrustedExecutionReceipt = "PASS";
      else delete target[Object.keys(target)[0]];
      assert.throws(() => assertHistoricalR3Material(value.material), /unexpected fields/);
    }
  }
});

test("W9 historical R3 material rejects malformed types and non-UTF-8 chunks", () => {
  for (const invalid of [null, undefined, [], "material", 2961, true]) {
    assert.throws(() => assertHistoricalR3Material(invalid), /material: expected object/);
  }
  for (const key of ["parentBaseline", "trackingMap", "task", "payload"]) {
    const value = historicalR3Mutation();
    value.material[key] = null;
    assert.throws(() => assertHistoricalR3Material(value.material), /expected object/);
  }
  for (const chunks of ["not an array", [123], [null], ["\ud800"]]) {
    const taskValue = historicalR3Mutation();
    taskValue.task.chunks = chunks;
    assert.throws(() => assertHistoricalR3Material(taskValue.material), /task: expected UTF-8 string chunks/);
    const payloadValue = historicalR3Mutation();
    payloadValue.entries[0].record.chunks = chunks;
    assert.throws(() => assertHistoricalR3Material(payloadValue.material), /entry: expected UTF-8 string chunks/);
  }
  const invalidEntries = historicalR3Mutation();
  invalidEntries.payload.entries = {};
  assert.throws(() => assertHistoricalR3Material(invalidEntries.material), /payload: expected entries/);
  const invalidEntry = historicalR3Mutation();
  invalidEntry.payload.entries = [null, ...invalidEntry.entries.slice(1).map(entry => entry.record)];
  assert.throws(() => assertHistoricalR3Material(invalidEntry.material), /entry: expected object/);
});

test("W9 historical R3 material rejects synthetic earlier and later task substitutions", () => {
  // Synthetic valid UTF-8 revisions, not evidence of actual historical versions.
  const earlier = historicalR3Mutation();
  earlier.task.chunks = earlier.taskChunks.slice(0, -1);
  assert.throws(() => assertHistoricalR3Material(earlier.material), /task byte length/);
  const later = historicalR3Mutation();
  later.taskChunks.push("\nSynthetic later task revision: additional completion record.\n");
  assert.throws(() => assertHistoricalR3Material(later.material), /task byte length/);
});

test("W9 historical R3 material rejects metadata and body self-authentication", () => {
  for (const claim of ["sha256", "blob", "bytes", "all"]) {
    const value = historicalR3Mutation();
    value.task.chunks = [value.taskChunks.join("").slice(0, -1)];
    assert.ok(historicalR3Chunks(value.task.chunks));
    const bytes = Buffer.from(value.task.chunks.join(""), "utf8");
    if (claim === "sha256" || claim === "all") value.task.sha256 = createHash("sha256").update(bytes).digest("hex");
    if (claim === "blob" || claim === "all") value.task.blob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    if (claim === "bytes" || claim === "all") value.task.bytes = bytes.length;
    assert.throws(() => assertHistoricalR3Material(value.material), /task (declared (digest|length)|source blob)/);
  }
  for (const claim of ["sha256", "bytes", "all"]) {
    const value = historicalR3Mutation();
    value.entries[1].chunks[0] = value.entries[1].chunks[0].slice(1);
    const bytes = Buffer.from(value.entries.map(entry => `${entry.record.path}\0${entry.chunks.join("")}`).join("\0"), "utf8");
    if (claim === "sha256" || claim === "all") value.payload.sha256 = createHash("sha256").update(bytes).digest("hex");
    if (claim === "bytes" || claim === "all") value.payload.bytes = bytes.length;
    assert.throws(() => assertHistoricalR3Material(value.material), /payload declared (digest|length)/);
  }
});

// T3 historical identity only; this pure seam never reads current Git or index.
const historicalT3TaskSha256 = "8485f4af59abeebdfc02b875593695e251adcb0cc0fc7cdad10df566afc39848";
const historicalT3PayloadSha256 = "b7e94178ef05299dddfa5bd001206794afd4440564d802a519b156354b0826b3";
const historicalT3OrderedPaths = [
  "odd/tasks/catalog-access-and-profit-report.md",
  "src-tauri/src/application/reporting/mod.rs",
  "src-tauri/src/commands/mod.rs",
  "src-tauri/src/commands/gross_profit.rs",
  "src-tauri/src/infrastructure/sqlite/dashboard_repository.rs",
  "src-tauri/src/lib.rs",
  "src-tauri/tests/gross_profit_report.rs",
  "src/commands/gross-profit.ts",
  "src/commands/gross-profit.test.ts",
  "src/commands/sales-history.ts",
  "src/commands/sales-history.test.ts",
  "src/ui/app.ts",
  "src/ui/app-shell.mounted.test.ts",
  "src/ui/reports/gross-profit-report-screen.ts",
  "src/ui/reports/gross-profit-report-screen.mounted.test.ts",
  "src/ui/w9-evidence-audit.test.ts",
];

function assertHistoricalT3Material(value: unknown): void {
  historicalR3Record(value, ["profile", "provenance", "candidate", "candidateTree", "parentBaseline", "trackingMap", "sourceAuditBlob", "task", "payload"], "material");
  assert.equal(value.profile, "gross-profit-report-t3", "profile identity");
  assert.equal(value.provenance, "DERIVED", "material provenance");
  assert.equal(value.candidate, "d7001db633343679a503a9b339afaa112a9daf8a", "candidate identity");
  assert.equal(value.candidateTree, "11e40cca39c12e1c5d93607660ae57db4b49a9c9", "candidate tree identity");
  historicalR3Record(value.parentBaseline, ["provenance", "revision"], "parent baseline");
  assert.equal(value.parentBaseline.provenance, "DERIVED", "parent baseline provenance");
  assert.equal(value.parentBaseline.revision, "f1bafb5af15bcdf4407286bc928072220fb439d5", "parent baseline identity");
  historicalR3Record(value.trackingMap, ["provenance", "basis"], "tracking map");
  assert.equal(value.trackingMap.provenance, "DERIVED", "tracking map provenance");
  assert.equal(value.trackingMap.basis, "parent-tree-membership", "tracking map basis");
  assert.equal(value.sourceAuditBlob, "319b9c03f8ab67f5ebf3f11759b94601a3853c50", "source audit identity");
  historicalR3Record(value.task, ["path", "blob", "bytes", "sha256", "chunks"], "task");
  assert.equal(value.task.path, historicalT3OrderedPaths[0], "task source path");
  assert.equal(value.task.blob, "7e5b4c3d061e8f0dba478a2391174cceed8ec1c7", "task source blob");
  assert.equal(value.task.bytes, 5753, "task declared length");
  assert.equal(value.task.sha256, historicalT3TaskSha256, "task declared digest");
  assert.ok(historicalR3Chunks(value.task.chunks), "task: expected UTF-8 string chunks");
  const taskBytes = Buffer.from(value.task.chunks.join(""), "utf8");
  assert.equal(taskBytes.length, 5753, "task byte length");
  assert.equal(createHash("sha256").update(taskBytes).digest("hex"), historicalT3TaskSha256, "task byte digest");
  assert.equal(createHash("sha1").update(`blob ${taskBytes.length}\0`).update(taskBytes).digest("hex"), "7e5b4c3d061e8f0dba478a2391174cceed8ec1c7", "task Git blob identity");
  historicalR3Record(value.payload, ["bytes", "sha256", "entries"], "payload");
  assert.equal(value.payload.bytes, 45505, "payload declared length");
  assert.equal(value.payload.sha256, historicalT3PayloadSha256, "payload declared digest");
  assert.ok(Array.isArray(value.payload.entries), "payload: expected entries");
  assert.equal(value.payload.entries.length, 16, "payload path count");
  const representations = value.payload.entries.map((entry: unknown, index: number) => {
    historicalR3Record(entry, ["path", "kind", "chunks"], "entry");
    assert.equal(entry.path, historicalT3OrderedPaths[index], "payload path order");
    assert.equal(entry.kind, ["D", "D", "D", "F", "D", "D", "F", "F", "F", "D", "D", "D", "D", "F", "F", "D"][index], "representation kind");
    assert.ok(historicalR3Chunks(entry.chunks), "entry: expected UTF-8 string chunks");
    // Preserve historical normalization, NUL separators and exact final newlines.
    return `${entry.path}\0${entry.chunks.join("")}`;
  });
  const payloadBytes = Buffer.from(representations.join("\0"), "utf8");
  assert.equal(payloadBytes.length, 45505, "payload byte length");
  assert.equal(createHash("sha256").update(payloadBytes).digest("hex"), historicalT3PayloadSha256, "payload byte digest");
}

function readHistoricalT3Material(): unknown {
  return JSON.parse(read("test/fixtures/w9/gross-profit-report-t3.derived.json"));
}

test("W9 historical T3 material accepts exact derived evidence", () => {
  assert.doesNotThrow(() => assertHistoricalT3Material(readHistoricalT3Material()));
});

// Fresh decoded material for each rejection; no fixture metadata is trusted.
function historicalT3Mutation() {
  const material = readHistoricalT3Material();
  historicalR3Record(material, ["profile", "provenance", "candidate", "candidateTree", "parentBaseline", "trackingMap", "sourceAuditBlob", "task", "payload"], "test material");
  historicalR3Record(material.task, ["path", "blob", "bytes", "sha256", "chunks"], "test task");
  historicalR3Record(material.payload, ["bytes", "sha256", "entries"], "test payload");
  historicalR3Record(material.parentBaseline, ["provenance", "revision"], "test parent");
  historicalR3Record(material.trackingMap, ["provenance", "basis"], "test tracking map");
  assert.ok(historicalR3Chunks(material.task.chunks));
  assert.ok(Array.isArray(material.payload.entries));
  const entries = material.payload.entries.map((entry: unknown) => {
    historicalR3Record(entry, ["path", "kind", "chunks"], "test entry");
    assert.ok(historicalR3Chunks(entry.chunks));
    return { record: entry, chunks: entry.chunks };
  });
  return { material, task: material.task, taskChunks: material.task.chunks,
    payload: material.payload, entries, parent: material.parentBaseline, tracking: material.trackingMap };
}

test("W9 historical T3 material rejects byte tampering truncation and newline changes", () => {
  const mutations: [((body: string) => string), RegExp][] = [
    [body => `!${body.slice(1)}`, /byte digest/],
    [body => body.slice(0, -1), /byte length/],
    [body => `${body}\n`, /byte length/],
    [body => body.replaceAll("\n", "\r\n"), /byte length/],
    [body => body.replace("\n", "\r"), /byte digest/],
  ];
  for (const [mutate, rejection] of mutations) {
    const task = historicalT3Mutation();
    task.task.chunks = [mutate(task.taskChunks.join(""))];
    assert.throws(() => assertHistoricalT3Material(task.material), rejection);
    for (let index = 0; index < 16; index += 1) {
      const value = historicalT3Mutation();
      value.entries[index].record.chunks = [mutate(value.entries[index].chunks.join(""))];
      assert.throws(() => assertHistoricalT3Material(value.material), rejection);
    }
  }
  const audit = historicalT3Mutation();
  audit.entries[15].record.chunks = [audit.entries[15].chunks.join("").replace("<SELF_INDEX>", "<SELF_OTHER>")];
  assert.throws(() => assertHistoricalT3Material(audit.material), /payload byte digest/);
});

test("W9 historical T3 material rejects path and representation substitutions", () => {
  for (let index = 0; index < 16; index += 1) {
    const missing = historicalT3Mutation();
    missing.payload.entries = missing.entries.filter((_, position) => position !== index).map(entry => entry.record);
    assert.throws(() => assertHistoricalT3Material(missing.material), /payload path count/);
    const changed = historicalT3Mutation();
    changed.entries[index].record.path = `./${changed.entries[index].record.path}`;
    assert.throws(() => assertHistoricalT3Material(changed.material), /payload path order/);
    const kind = historicalT3Mutation();
    kind.entries[index].record.kind = kind.entries[index].record.kind === "D" ? "F" : "D";
    assert.throws(() => assertHistoricalT3Material(kind.material), /representation kind/);
  }
  const extra = historicalT3Mutation();
  extra.payload.entries = [...extra.entries.map(entry => entry.record), extra.entries[0].record];
  assert.throws(() => assertHistoricalT3Material(extra.material), /payload path count/);
  const reversed = historicalT3Mutation();
  reversed.payload.entries = reversed.entries.map(entry => entry.record).reverse();
  assert.throws(() => assertHistoricalT3Material(reversed.material), /payload path order/);
  const duplicate = historicalT3Mutation();
  duplicate.entries[1].record.path = duplicate.entries[0].record.path;
  assert.throws(() => assertHistoricalT3Material(duplicate.material), /payload path order/);
});

test("W9 historical T3 material binds independent metadata and provenance", () => {
  const changes: ["material" | "parent" | "tracking" | "task" | "payload", string, unknown, RegExp][] = [
    ["material", "profile", "gross-profit-report-t4", /profile identity/],
    ["material", "provenance", "ORIGINAL_EXECUTION", /material provenance/],
    ["material", "candidate", "0".repeat(40), /candidate identity/],
    ["material", "candidateTree", "0".repeat(40), /candidate tree identity/],
    ["material", "sourceAuditBlob", "0".repeat(40), /source audit identity/],
    ["parent", "revision", "0".repeat(40), /parent baseline identity/],
    ["parent", "provenance", "ORIGINAL_HEAD", /parent baseline provenance/],
    ["tracking", "provenance", "ORIGINAL_INDEX", /tracking map provenance/],
    ["tracking", "basis", "current-index", /tracking map basis/],
    ["task", "path", "odd/tasks/substituted.md", /task source path/],
    ["task", "blob", "0".repeat(40), /task source blob/],
    ["task", "bytes", "5753", /task declared length/],
    ["task", "sha256", "0".repeat(64), /task declared digest/],
    ["payload", "bytes", "45505", /payload declared length/],
    ["payload", "sha256", "0".repeat(64), /payload declared digest/],
  ];
  for (const [target, key, replacement, rejection] of changes) {
    const value = historicalT3Mutation();
    value[target][key] = replacement;
    assert.throws(() => assertHistoricalT3Material(value.material), rejection);
  }
});

test("W9 historical T3 material rejects unknown fields missing fields and malformed types", () => {
  for (let index = 0; index < 21; index += 1) {
    for (const action of ["extra", "missing"]) {
      const value = historicalT3Mutation();
      const records = [value.material, value.parent, value.tracking, value.task, value.payload,
        ...value.entries.map(entry => entry.record)];
      const target = records[index];
      if (action === "extra") target.untrustedExecutionReceipt = "PASS";
      else delete target[Object.keys(target)[0]];
      assert.throws(() => assertHistoricalT3Material(value.material), /unexpected fields/);
    }
  }
  for (const invalid of [null, undefined, [], "material", 5753, true]) {
    assert.throws(() => assertHistoricalT3Material(invalid), /material: expected object/);
  }
  for (const key of ["parentBaseline", "trackingMap", "task", "payload"]) {
    const value = historicalT3Mutation();
    value.material[key] = null;
    assert.throws(() => assertHistoricalT3Material(value.material), /expected object/);
  }
  for (const chunks of ["not an array", [123], [null], ["\ud800"]]) {
    const task = historicalT3Mutation();
    task.task.chunks = chunks;
    assert.throws(() => assertHistoricalT3Material(task.material), /task: expected UTF-8 string chunks/);
    const entry = historicalT3Mutation();
    entry.entries[0].record.chunks = chunks;
    assert.throws(() => assertHistoricalT3Material(entry.material), /entry: expected UTF-8 string chunks/);
  }
  const entries = historicalT3Mutation();
  entries.payload.entries = {};
  assert.throws(() => assertHistoricalT3Material(entries.material), /payload: expected entries/);
  const entry = historicalT3Mutation();
  entry.payload.entries = [null, ...entry.entries.slice(1).map(value => value.record)];
  assert.throws(() => assertHistoricalT3Material(entry.material), /entry: expected object/);
});

test("W9 historical T3 material rejects synthetic earlier and later task substitutions", () => {
  // Synthetic UTF-8 revisions, not independently recovered historical versions.
  const earlier = historicalT3Mutation();
  earlier.task.chunks = earlier.taskChunks.slice(0, -1);
  assert.throws(() => assertHistoricalT3Material(earlier.material), /task byte length/);
  const later = historicalT3Mutation();
  later.taskChunks.push("\nSynthetic later task revision: additional completion record.\n");
  assert.throws(() => assertHistoricalT3Material(later.material), /task byte length/);
});

test("W9 historical T3 material rejects metadata and body self-authentication", () => {
  for (const claim of ["sha256", "blob", "bytes", "all"]) {
    const value = historicalT3Mutation();
    const bytes = Buffer.from(value.taskChunks.join("").slice(0, -1), "utf8");
    value.task.chunks = [bytes.toString("utf8")];
    if (claim === "sha256" || claim === "all") value.task.sha256 = createHash("sha256").update(bytes).digest("hex");
    if (claim === "blob" || claim === "all") value.task.blob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    if (claim === "bytes" || claim === "all") value.task.bytes = bytes.length;
    assert.throws(() => assertHistoricalT3Material(value.material), /task (declared (digest|length)|source blob)/);
  }
  for (const claim of ["sha256", "bytes", "all"]) {
    const value = historicalT3Mutation();
    value.entries[3].chunks[0] = value.entries[3].chunks[0].slice(1);
    const bytes = Buffer.from(value.entries.map(entry => `${entry.record.path}\0${entry.chunks.join("")}`).join("\0"), "utf8");
    if (claim === "sha256" || claim === "all") value.payload.sha256 = createHash("sha256").update(bytes).digest("hex");
    if (claim === "bytes" || claim === "all") value.payload.bytes = bytes.length;
    assert.throws(() => assertHistoricalT3Material(value.material), /payload declared (digest|length)/);
  }
});
