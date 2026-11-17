fn main() {
    tauri_build::build();

    // games.json is kept readable for hand edits; the binary gets it minified.
    println!("cargo:rerun-if-changed=src/activity/games.json");
    let games = std::fs::read_to_string("src/activity/games.json").expect("games.json");
    let games: serde_json::Value =
        serde_json::from_str(&games).expect("games.json is not valid JSON");
    let out =
        std::path::Path::new(&std::env::var_os("OUT_DIR").expect("OUT_DIR")).join("games.min.json");
    std::fs::write(out, games.to_string()).expect("write games.min.json");
}
