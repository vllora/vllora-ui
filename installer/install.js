#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

const REPO = 'langdb/ellora-ui'; // Update this
const VERSION = 'v0.1.0';
const DMG_NAME = 'Ellora_0.1.0_aarch64.dmg';

console.log('🚀 Installing Ellora...\n');

// Check platform
if (os.platform() !== 'darwin') {
  console.error('❌ Error: Ellora currently only supports macOS');
  process.exit(1);
}

// Check architecture
if (os.arch() !== 'arm64') {
  console.error('❌ Error: This installer is for Apple Silicon (M1/M2/M3) Macs only');
  process.exit(1);
}

const downloadUrl = `https://github.com/${REPO}/releases/download/${VERSION}/${DMG_NAME}`;
const tmpDir = os.tmpdir();
const dmgPath = path.join(tmpDir, DMG_NAME);

console.log(`📦 Downloading from: ${downloadUrl}`);

// Download DMG
const file = fs.createWriteStream(dmgPath);
https.get(downloadUrl, (response) => {
  if (response.statusCode === 302 || response.statusCode === 301) {
    // Follow redirect
    https.get(response.headers.location, (redirectResponse) => {
      redirectResponse.pipe(file);
      file.on('finish', () => {
        file.close();
        installDmg();
      });
    });
  } else {
    response.pipe(file);
    file.on('finish', () => {
      file.close();
      installDmg();
    });
  }
}).on('error', (err) => {
  fs.unlink(dmgPath, () => {});
  console.error(`❌ Download failed: ${err.message}`);
  process.exit(1);
});

function installDmg() {
  console.log('\n✅ Download complete!');
  console.log('📂 Mounting DMG...');

  try {
    // Mount the DMG
    const mountOutput = execSync(`hdiutil attach "${dmgPath}" -nobrowse -noverify`, { encoding: 'utf8' });
    const volumePath = mountOutput.match(/\/Volumes\/[^\s]+/)?.[0];

    if (!volumePath) {
      throw new Error('Could not find mounted volume');
    }

    console.log('📋 Copying to Applications...');

    // Copy app to Applications
    execSync(`cp -R "${volumePath}/Ellora.app" /Applications/`, { stdio: 'inherit' });

    console.log('🔓 Removing quarantine attribute...');

    // Remove quarantine
    execSync('sudo /usr/bin/xattr -rd com.apple.quarantine /Applications/Ellora.app', { stdio: 'inherit' });

    // Unmount DMG
    execSync(`hdiutil detach "${volumePath}"`, { stdio: 'ignore' });

    // Clean up
    fs.unlinkSync(dmgPath);

    console.log('\n✨ Installation complete!');
    console.log('🚀 Launch Ellora from your Applications folder');
    console.log('📊 Database: ~/.langdb/langdb.sqlite');
    console.log('📝 Logs: ~/Library/Logs/com.ellora.app/\n');

  } catch (error) {
    console.error(`\n❌ Installation failed: ${error.message}`);
    console.log('\n📖 Manual installation:');
    console.log(`1. Open: ${dmgPath}`);
    console.log('2. Drag Ellora.app to Applications');
    console.log('3. Right-click Ellora.app → Open → Open');
    process.exit(1);
  }
}
