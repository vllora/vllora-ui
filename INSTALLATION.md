# Ellora Installation Guide

## macOS Installation

### Download
Download `Ellora_0.1.0_aarch64.dmg` from the [latest release](https://github.com/YOUR_ORG/ellora-ui/releases/latest)

### Installation Steps

1. **Open the DMG file**
   - Double-click `Ellora_0.1.0_aarch64.dmg`

2. **Drag Ellora to Applications**
   - Drag the Ellora icon to the Applications folder

3. **Remove quarantine attribute (Required)**

   macOS will block the app because it's not signed with an Apple Developer certificate.

   **Method A: Using Terminal (Recommended)**

   Run this command in Terminal:

   ```bash
   sudo /usr/bin/xattr -rd com.apple.quarantine /Applications/Ellora.app
   ```

   Enter your password when prompted.

   **Method B: Using Finder (Easier)**

   1. Right-click (or Control-click) on `Ellora.app` in Applications folder
   2. Select "Open" from the menu
   3. Click "Open" in the security dialog that appears

4. **Launch Ellora**
   - Open Ellora from your Applications folder
   - The app will start and spawn the AI Gateway backend automatically

### Troubleshooting

**Error: "Ellora is damaged and can't be opened"**
- This means you skipped step 3. Run the `xattr` command above.

**Backend not starting**
- Check logs at: `~/Library/Logs/com.ellora.app/`
- Database is stored at: `~/.langdb/langdb.sqlite`

**APIs not working**
- Make sure the backend started successfully
- Check the logs for any errors
- Restart the app

### Uninstallation

```bash
# Remove the app
rm -rf /Applications/Ellora.app

# Remove app data (optional)
rm -rf ~/Library/Logs/com.ellora.app/
rm -rf ~/.langdb/
```

---

**Note:** This app requires an Apple Silicon (M1/M2/M3) Mac running macOS 11.0 or later.
