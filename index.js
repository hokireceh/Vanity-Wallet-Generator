#!/usr/bin/env node

/**
 * EVM Vanity Wallet Generator CLI - Multi-threaded Edition
 * Optimized for multi-core processors
 * 
 * Installation:
 * npm install ethers commander chalk ora
 * 
 * Usage:
 * node vanity-wallet-cli.js -p 22AF -n 5 -t 12
 */

const ethers = require('ethers');
const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const os = require('os');

// Color helpers (no external dependency)
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

const chalk = {
  red: (text) => `${colors.red}${text}${colors.reset}`,
  green: (text) => `${colors.green}${text}${colors.reset}`,
  yellow: (text) => `${colors.yellow}${text}${colors.reset}`,
  blue: (text) => `${colors.blue}${text}${colors.reset}`,
  cyan: (text) => `${colors.cyan}${text}${colors.reset}`,
  white: (text) => `${colors.white}${text}${colors.reset}`,
  gray: (text) => `${colors.gray}${text}${colors.reset}`,
  bold: (text) => `${colors.bright}${text}${colors.reset}`
};

// Simple spinner
class Spinner {
  constructor(text) {
    this._text = text;
    this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.frameIndex = 0;
    this.interval = null;
  }

  start() {
    this.interval = setInterval(() => {
      process.stdout.write(`\r${this.frames[this.frameIndex]} ${this._text}`);
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    }, 80);
    return this;
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      process.stdout.write('\r' + ' '.repeat(100) + '\r');
    }
    return this;
  }

  set text(value) {
    this._text = value;
  }

  get text() {
    return this._text;
  }
}

const ora = (text) => new Spinner(text);

// Configuration
const program = new Command();

program
  .name('vanity-wallet')
  .description('Generate EVM wallets with custom address patterns')
  .version('2.0.0')
  .option('-p, --pattern <string>', 'Pattern to search for (hex characters)', '')
  .option('-s, --position <string>', 'Pattern position: start, end, anywhere', 'end')
  .option('-c, --case-sensitive', 'Enable case-sensitive matching', false)
  .option('-n, --number <int>', 'Number of wallets to generate', '1')
  .option('-o, --output <file>', 'Output file (JSON)', 'wallets.json')
  .option('-t, --threads <int>', `Number of threads (default: ${os.cpus().length})`, os.cpus().length.toString())
  .option('--no-save', 'Don\'t save to file, only display')
  .option('--double', 'Match pattern at both start AND end (much harder!)', false)
  .option('--prefix <string>', 'Pattern for start (use with --suffix)', '')
  .option('--suffix <string>', 'Pattern for end (use with --prefix)', '')
  .parse(process.argv);

const options = program.opts();

// Validate pattern
function validatePattern(pattern) {
  if (!pattern) return true;
  const hexPattern = /^[0-9a-fA-F]+$/;
  return hexPattern.test(pattern);
}

// Check if address matches pattern
function matchesPattern(address, pattern, position, caseSensitive, isDouble, prefix, suffix) {
  const addr = caseSensitive ? address : address.toLowerCase();

  // Double-ended pattern (both start and end)
  if (isDouble && pattern) {
    const patt = caseSensitive ? pattern : pattern.toLowerCase();
    const addrWithout0x = addr.substring(2); // Remove 0x
    return addrWithout0x.startsWith(patt) && addrWithout0x.endsWith(patt);
  }

  // Custom prefix + suffix
  if (prefix && suffix) {
    const pre = caseSensitive ? prefix : prefix.toLowerCase();
    const suf = caseSensitive ? suffix : suffix.toLowerCase();
    const addrWithout0x = addr.substring(2);
    return addrWithout0x.startsWith(pre) && addrWithout0x.endsWith(suf);
  }

  // Single pattern
  if (!pattern) return true;
  const patt = caseSensitive ? pattern : pattern.toLowerCase();

  if (position === 'start') {
    return addr.substring(2).startsWith(patt);
  } else if (position === 'end') {
    return addr.endsWith(patt);
  } else {
    return addr.includes(patt);
  }
}

// Calculate difficulty estimate
function estimateDifficulty(pattern, caseSensitive, isDouble, prefix, suffix) {
  const base = caseSensitive ? 16 : 22;

  // Double-ended pattern
  if (isDouble && pattern) {
    return Math.pow(base, pattern.length * 2);
  }

  // Custom prefix + suffix
  if (prefix && suffix) {
    return Math.pow(base, prefix.length + suffix.length);
  }

  // Single pattern
  if (!pattern) return 1;
  return Math.pow(base, pattern.length);
}

// Format number with commas
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Save wallets to file
function saveWallets(wallets, filename) {
  const output = {
    generated_at: new Date().toISOString(),
    count: wallets.length,
    total_attempts: wallets.reduce((sum, w) => sum + (w.attempts || 0), 0),
    wallets: wallets.map(w => ({
      address: w.address,
      privateKey: w.privateKey,
      mnemonic: w.mnemonic && typeof w.mnemonic === 'string' ? w.mnemonic : null,
      attempts: w.attempts
    }))
  };

  fs.writeFileSync(filename, JSON.stringify(output, null, 2));
}

// Display wallet info
function displayWallet(wallet, index) {
  console.log(chalk.bold(chalk.green(`\n✓ Wallet #${index + 1} Found!`)));
  console.log(chalk.cyan('Address:     ') + chalk.bold(chalk.white(wallet.address)));
  console.log(chalk.cyan('Private Key: ') + chalk.yellow(wallet.privateKey));
  if (wallet.mnemonic && typeof wallet.mnemonic === 'string') {
    console.log(chalk.cyan('Mnemonic:    ') + chalk.gray(wallet.mnemonic));
  }
  if (wallet.attempts) {
    console.log(chalk.gray(`Attempts: ${formatNumber(wallet.attempts)}`));
  }
}

// Worker code as string (for dynamic worker creation)
const workerCode = `
const { parentPort, workerData } = require('worker_threads');
const ethers = require('ethers');

function matchesPattern(address, pattern, position, caseSensitive, isDouble, prefix, suffix) {
  const addr = caseSensitive ? address : address.toLowerCase();

  // Double-ended pattern
  if (isDouble && pattern) {
    const patt = caseSensitive ? pattern : pattern.toLowerCase();
    return addr.substring(2).startsWith(patt) && addr.endsWith(patt);
  }

  // Custom prefix + suffix
  if (prefix && suffix) {
    const pre = caseSensitive ? prefix : prefix.toLowerCase();
    const suf = caseSensitive ? suffix : suffix.toLowerCase();
    return addr.substring(2).startsWith(pre) && addr.endsWith(suf);
  }

  // Single pattern
  if (!pattern) return true;
  const patt = caseSensitive ? pattern : pattern.toLowerCase();

  if (position === 'start') {
    return addr.substring(2).startsWith(patt);
  } else if (position === 'end') {
    return addr.endsWith(patt);
  } else {
    return addr.includes(patt);
  }
}

let attempts = 0;
let running = true;

parentPort.on('message', (msg) => {
  if (msg === 'stop') {
    running = false;
  }
});

// Generation loop
const batchSize = 50000;
while (running) {
  for (let i = 0; i < batchSize; i++) {
    attempts++;

    const wallet = ethers.Wallet.createRandom();

    if (matchesPattern(
      wallet.address, 
      workerData.pattern, 
      workerData.position, 
      workerData.caseSensitive,
      workerData.isDouble,
      workerData.prefix,
      workerData.suffix
    )) {
      parentPort.postMessage({
        type: 'found',
        wallet: {
          address: wallet.address,
          privateKey: wallet.privateKey,
          mnemonic: wallet.mnemonic.phrase,
          attempts: attempts
        }
      });

      if (!workerData.multiple) {
        running = false;
        break;
      }
    }
  }

  // Report progress every batch
  parentPort.postMessage({
    type: 'progress',
    attempts: batchSize
  });
}

parentPort.postMessage({ type: 'done' });
`;

// Create worker
function createWorker(workerData) {
  // Write worker code to temp file
  const workerFile = path.join(__dirname, '.worker-temp.js');
  fs.writeFileSync(workerFile, workerCode);

  return new Worker(workerFile, { workerData });
}

// Main generation function with multi-threading
async function generateVanityWallets() {
  const pattern = options.pattern;
  const position = options.position;
  const caseSensitive = options.caseSensitive;
  const targetCount = parseInt(options.number);
  const outputFile = options.output;
  const threadCount = parseInt(options.threads);
  const isDouble = options.double;
  const prefix = options.prefix;
  const suffix = options.suffix;

  // Validation
  if (pattern && !validatePattern(pattern)) {
    console.error(chalk.red('Error: Pattern must contain only hex characters (0-9, a-f, A-F)'));
    process.exit(1);
  }

  if (prefix && !validatePattern(prefix)) {
    console.error(chalk.red('Error: Prefix must contain only hex characters'));
    process.exit(1);
  }

  if (suffix && !validatePattern(suffix)) {
    console.error(chalk.red('Error: Suffix must contain only hex characters'));
    process.exit(1);
  }

  if (!['start', 'end', 'anywhere'].includes(position)) {
    console.error(chalk.red('Error: Position must be start, end, or anywhere'));
    process.exit(1);
  }

  // Display configuration
  console.log(chalk.bold(chalk.blue('\n🔐 Vanity Wallet Generator - Multi-threaded\n')));
  console.log(chalk.cyan('CPU Cores:      ') + chalk.white(os.cpus().length));
  console.log(chalk.cyan('CPU Model:      ') + chalk.white(os.cpus()[0].model));
  console.log(chalk.cyan('Threads:        ') + chalk.bold(chalk.white(threadCount)));

  if (isDouble && pattern) {
    console.log(chalk.cyan('Mode:           ') + chalk.bold(chalk.yellow('DOUBLE-ENDED')));
    console.log(chalk.cyan('Pattern:        ') + chalk.bold(chalk.white(`0x${pattern}...${pattern}`)));
  } else if (prefix && suffix) {
    console.log(chalk.cyan('Mode:           ') + chalk.bold(chalk.yellow('PREFIX + SUFFIX')));
    console.log(chalk.cyan('Prefix:         ') + chalk.bold(chalk.white(prefix)));
    console.log(chalk.cyan('Suffix:         ') + chalk.bold(chalk.white(suffix)));
  } else {
    console.log(chalk.cyan('Pattern:        ') + chalk.bold(chalk.white(pattern || '(any)')));
    console.log(chalk.cyan('Position:       ') + chalk.white(position));
  }

  console.log(chalk.cyan('Case Sensitive: ') + chalk.white(caseSensitive ? 'Yes' : 'No'));
  console.log(chalk.cyan('Target Count:   ') + chalk.white(targetCount));

  const difficulty = estimateDifficulty(pattern, caseSensitive, isDouble, prefix, suffix);
  const estimatedTime = difficulty / (threadCount * 50000);

  console.log(chalk.cyan('Est. Attempts:  ') + chalk.yellow(formatNumber(Math.round(difficulty))));
  console.log(chalk.cyan('Est. Time:      ') + chalk.yellow(
    estimatedTime < 1 ? '< 1 second' :
    estimatedTime < 60 ? `~${Math.round(estimatedTime)} seconds` :
    estimatedTime < 3600 ? `~${Math.round(estimatedTime / 60)} minutes` :
    estimatedTime < 86400 ? `~${(estimatedTime / 3600).toFixed(1)} hours` :
    `~${(estimatedTime / 86400).toFixed(1)} days`
  ));

  if (difficulty > 100000000) {
    console.log(chalk.bold(chalk.yellow('\n⚠️  WARNING: This pattern is EXTREMELY difficult!')));
    console.log(chalk.yellow('   Double-ended patterns can take hours or days!'));
    console.log(chalk.yellow('   Consider using shorter patterns or single-ended matching.\n'));
  }

  console.log('');

  const foundWallets = [];
  let totalAttempts = 0;
  let workerAttempts = {};
  const startTime = Date.now();

  const spinner = ora('Starting workers...').start();

  // Create workers
  const workers = [];
  const workerData = {
    pattern,
    position,
    caseSensitive,
    multiple: targetCount > threadCount,
    isDouble,
    prefix,
    suffix
  };

  for (let i = 0; i < threadCount; i++) {
    const worker = createWorker(workerData);
    workers.push(worker);
    workerAttempts[i] = 0;

    worker.on('message', (msg) => {
      if (msg.type === 'found') {
        foundWallets.push(msg.wallet);
        spinner.stop();
        displayWallet(msg.wallet, foundWallets.length - 1);

        if (foundWallets.length >= targetCount) {
          // Stop all workers
          workers.forEach(w => w.postMessage('stop'));
        } else {
          spinner.start();
        }
      } else if (msg.type === 'progress') {
        workerAttempts[i] = msg.attempts;
        totalAttempts = Object.values(workerAttempts).reduce((a, b) => a + b, 0);
      }
    });

    worker.on('error', (err) => {
      console.error(chalk.red(`Worker error: ${err.message}`));
    });
  }

  // Update spinner periodically
  const updateInterval = setInterval(() => {
    if (!spinner.interval) return; // Skip if spinner is stopped
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = Math.round(totalAttempts / elapsed);
    spinner.text = `Generated ${formatNumber(totalAttempts)} addresses (${formatNumber(rate)}/s) - Found ${foundWallets.length}/${targetCount} - ${threadCount} threads active`;
  }, 200);

  // Wait for completion
  await new Promise((resolve) => {
    const checkComplete = setInterval(() => {
      if (foundWallets.length >= targetCount) {
        clearInterval(checkComplete);
        clearInterval(updateInterval);

        // Terminate all workers
        workers.forEach(w => {
          w.postMessage('stop');
          w.terminate();
        });

        // Cleanup temp file
        try {
          fs.unlinkSync(path.join(__dirname, '.worker-temp.js'));
        } catch (e) {}

        spinner.stop();
        resolve();
      }
    }, 100);
  });

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  const avgRate = Math.round(totalAttempts / elapsed);

  console.log(chalk.bold(chalk.green(`\n✓ Generation Complete!`)));
  console.log(chalk.cyan('Total Attempts: ') + chalk.white(formatNumber(totalAttempts)));
  console.log(chalk.cyan('Time Elapsed:   ') + chalk.white(`${elapsed}s`));
  console.log(chalk.cyan('Average Rate:   ') + chalk.bold(chalk.white(`${formatNumber(avgRate)}/s`)));
  console.log(chalk.cyan('Peak Rate:      ') + chalk.white(`~${formatNumber(avgRate * threadCount)}/s (${threadCount} threads)`));

  // Save to file
  if (options.save && foundWallets.length > 0) {
    try {
      saveWallets(foundWallets, outputFile);
      console.log(chalk.cyan('\nSaved to:       ') + chalk.white(path.resolve(outputFile)));
    } catch (err) {
      console.error(chalk.red(`\nError saving file: ${err.message}`));
    }
  }

  // Security warning
  console.log(chalk.bold(chalk.red('\n⚠️  SECURITY WARNING:')));
  console.log(chalk.red('   Keep your private keys secure and NEVER share them!'));
  console.log(chalk.red('   Anyone with the private key has full access to the wallet.\n'));
}

// Run
if (require.main === module) {
  generateVanityWallets().catch(err => {
    console.error(chalk.red('Error:'), err.message);

    // Cleanup on error
    try {
      fs.unlinkSync(path.join(__dirname, '.worker-temp.js'));
    } catch (e) {}

    process.exit(1);
  });
}

module.exports = { generateVanityWallets };