# Vanity Wallet Generator

Generate Ethereum vanity wallets with custom address patterns using multi-threaded processing. This CLI tool helps you create wallet addresses that match specific hex patterns.

## Features

- 🚀 **Multi-threaded Generation** - Utilizes all available CPU cores for faster wallet generation
- 🎯 **Flexible Pattern Matching** - Support for start, end, or anywhere pattern matching
- 🔤 **Case Sensitivity** - Optional case-sensitive pattern matching
- 🔀 **Prefix & Suffix** - Combine custom prefix and suffix patterns
- 💾 **Batch Generation** - Generate multiple matching wallets in one run
- 📊 **Real-time Statistics** - Monitor progress with live generation speed metrics
- 🔐 **Secure** - Uses ethers.js for cryptographically secure wallet generation

## Installation

### Prerequisites
- Node.js 14+ and npm

### Setup

```bash
# Clone the repository
git clone https://github.com/hokireceh/Vanity-Wallet-Generator
cd Vanity-Wallet-Generator

# Install dependencies
npm install
```

## Usage

### Basic Usage

Generate a single wallet with any address:
```bash
node index.js
```

### Generate with Pattern

Generate wallet(s) with a specific hex pattern at the end of the address:
```bash
node index.js -p ABCD -n 1
```

### Command Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--pattern` | `-p` | Hex pattern to search for | '' |
| `--position` | `-s` | Pattern position: `start`, `end`, `anywhere` | `end` |
| `--case-sensitive` | `-c` | Enable case-sensitive matching | false |
| `--number` | `-n` | Number of wallets to generate | 1 |
| `--output` | `-o` | Output file (JSON) | `wallets.json` |
| `--threads` | `-t` | Number of threads (default: CPU cores) | auto |
| `--no-save` | - | Don't save to file, only display | false |
| `--double` | - | Match pattern at both start AND end | false |
| `--prefix` | - | Pattern for start (use with --suffix) | '' |
| `--suffix` | - | Pattern for end (use with --prefix) | '' |

### Examples

**Generate 5 wallets ending with "DEAD":**
```bash
node index.js -p DEAD -n 5
```

**Generate wallet starting with "BABE" (case-insensitive):**
```bash
node index.js -p BABE -s start -n 1
```

**Generate wallet with "DEAD" at both start and end (case-sensitive):**
```bash
node index.js -p DEAD --double -c -n 1
```

**Generate wallet with custom prefix and suffix:**
```bash
node index.js --prefix ABC --suffix DEF -n 1
```

**Generate using 4 threads:**
```bash
node index.js -p 1234 -n 3 -t 4
```

**Display only, don't save to file:**
```bash
node index.js -p CAFE --no-save
```

## Output Format

The generated wallets are saved as JSON with the following structure:

```json
{
  "generated_at": "2025-11-26T05:04:28.224Z",
  "count": 1,
  "total_attempts": 10000,
  "wallets": [
    {
      "address": "0x0a0ec9cC1152D160e94821E39A944e47827ac574",
      "privateKey": "0x885ff7a4dc37672e07098c2d9e0c04554ecddd2684b6f75467e0bf80f0cd504d",
      "attempts": 10000
    }
  ]
}
```

## Performance

The tool automatically estimates the difficulty of your pattern and provides an estimated time to completion. Performance depends on:

- **Pattern Complexity** - Longer patterns take exponentially longer to find
- **CPU Cores** - More threads = faster generation
- **Case Sensitivity** - Case-sensitive patterns are harder to find
- **Position** - Start and end positions are harder than "anywhere"

### Difficulty Estimation

- **4 hex chars** (case-insensitive): ~16^4 = 65,536 attempts
- **6 hex chars** (case-insensitive): ~16^6 = 16,777,216 attempts
- **8 hex chars** (case-insensitive): ~16^8 = 4,294,967,296 attempts

Typical generation rate: 40,000+ addresses/second on 8-core CPU

## ⚠️ Security Warning

**NEVER share or commit your private keys!** The generated wallet JSON files contain sensitive information. Always:

- Keep private keys secure and confidential
- Never share them via email, messaging, or public channels
- Store safely if needed (hardware wallet, encrypted vault, etc.)
- This `.gitignore` is configured to prevent accidental commits of wallet files

## File Structure

```
Vanity-Wallet-Generator/
├── index.js              # Main CLI application
├── package.json          # Project dependencies
├── package-lock.json     # Locked dependency versions
├── README.md             # This file
├── .gitignore            # Git ignore rules
└── wallets.json          # Generated wallets (not committed)
```

## Troubleshooting

### "Pattern must contain only hex characters"
Make sure your pattern only uses 0-9 and a-f (or A-F for case-sensitive).

### Generation is very slow
- Try a shorter pattern
- Increase thread count with `-t` option
- Use "anywhere" position instead of "start" or "end"
- Use case-insensitive matching

### No output file created
Use the `-o` option to specify output file or remove `--no-save` flag.

## Requirements

- **Node.js**: v14 or higher
- **npm**: v6 or higher
- **ethers.js**: v6.15.0
- **commander**: v14.0.2

## License

ISC

## Author

HokiReceh

## Contributing

Contributions are welcome! Feel free to submit issues and pull requests.

---

**Need Help?** Open an issue on [GitHub](https://github.com/hokireceh/Vanity-Wallet-Generator/issues)
