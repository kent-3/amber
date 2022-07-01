const { bech32 } = require("bech32");
const fs = require("fs");
const TOML = require("@iarna/toml");

function main() {
  const data = fs.readFileSync("snapshot/00-bech32.toml");
  const tomlData = TOML.parse(data);

  let newToml = {};
  for (var addr of Object.keys(tomlData)) {
    const bytes = bech32.fromWords(bech32.decode(addr).words);
    const buf = Buffer.from(bytes);
    const newKey = "0x" + buf.toString("hex");

    newToml[newKey] = tomlData[addr];
  }

  fs.writeFileSync("snapshot/00-bytes.toml", TOML.stringify(newToml));
}

main();
