# Vendored Distri Packages

This document explains how the `@distri/core` and `@distri/react` packages are vendored locally in the vllora UI project, allowing CI to run without needing access to the distrijs repository.

## Overview

Instead of using npm-published versions of the distri packages, we vendor (bundle) them locally in the `vendor/` directory. This approach provides:

- **CI Independence**: CI pipelines don't need to check out the distrijs repo
- **Version Control**: Vendored packages are committed to git, ensuring reproducible builds
- **Local Development**: Easy to test changes from the distrijs repo before publishing

## Directory Structure

```
ui/
├── vendor/
│   ├── distri-core/
│   │   ├── package.json      # Minimal package config
│   │   └── dist/             # Built package files
│   │       ├── index.js
│   │       ├── index.mjs
│   │       ├── index.d.ts
│   │       └── ...
│   └── distri-react/
│       ├── package.json      # Minimal package config with dependencies
│       └── dist/             # Built package files
│           ├── index.js
│           ├── index.cjs
│           ├── index.d.ts
│           ├── globals.css
│           └── ...
└── package.json              # References vendor packages via file: protocol
```

## How It Works

### 1. Package References

In `ui/package.json`, the distri packages are referenced using the `file:` protocol:

```json
{
  "dependencies": {
    "@distri/core": "file:./vendor/distri-core",
    "@distri/react": "file:./vendor/distri-react"
  }
}
```

This tells pnpm to resolve these packages from the local `vendor/` directory instead of npm.

### 2. Vendor Package Structure

Each vendored package contains:

- **`package.json`**: Minimal configuration with name, version, exports, and dependencies
- **`dist/`**: The built JavaScript/TypeScript files from the distrijs build

Example `vendor/distri-core/package.json`:
```json
{
  "name": "@distri/core",
  "version": "0.3.3",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    }
  },
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts"
}
```

## Updating Vendored Packages

When you make changes to the distrijs repository and want to update the vendored packages in vllora:

### Quick Method (Recommended)

Use the sync script which handles everything automatically:

```bash
cd /path/to/vllora/ui
pnpm run sync:distrijs
```

This script:
1. Builds `@distri/core` in distrijs
2. Builds `@distri/react` in distrijs
3. Copies the `dist/` folders to vendor
4. Runs `pnpm install`
5. Shows next steps

### Script Options

```bash
# Full sync (build + copy + install)
pnpm run sync:distrijs

# Skip build, just copy existing dist folders
pnpm run sync:distrijs:no-build

# Or use the script directly with more options:
./scripts/sync-distrijs.sh --core      # Only sync @distri/core
./scripts/sync-distrijs.sh --react     # Only sync @distri/react
./scripts/sync-distrijs.sh --no-build  # Skip build step
./scripts/sync-distrijs.sh --help      # Show all options
```

### After Syncing

```bash
# Verify TypeScript compilation
pnpm tsc --noEmit

# Test the app
pnpm dev

# Commit the changes
git add vendor/
git commit -m "chore: update vendored distri packages"
```

## Manual Update Process

If you prefer to update manually:

```bash
# 1. Build in distrijs
cd /path/to/distri/distrijs/packages/core && pnpm build
cd /path/to/distri/distrijs/packages/react && pnpm build

# 2. Copy dist folders
cd /path/to/vllora/ui
rm -rf vendor/distri-core/dist vendor/distri-react/dist
cp -r ../distri/distrijs/packages/core/dist vendor/distri-core/
cp -r ../distri/distrijs/packages/react/dist vendor/distri-react/

# 3. Reinstall
pnpm install
```

## Updating the Version Number

When updating vendored packages, also update the version in the vendor package.json files:

1. Edit `vendor/distri-core/package.json` - update `"version"`
2. Edit `vendor/distri-react/package.json` - update `"version"`

This helps track which version of the distrijs packages are vendored.

## CI/CD Considerations

### Benefits
- CI doesn't need access to distrijs repository
- Builds are reproducible - same vendor files = same build
- No network requests to npm for distri packages

### Best Practices
- Always commit vendor changes with descriptive messages
- Keep vendor packages in sync with any distrijs changes you depend on
- Consider running `pnpm tsc --noEmit` in CI to catch type errors

## Troubleshooting

### "Module not found" errors

Ensure `pnpm install` was run after updating vendor packages:
```bash
pnpm install
```

### TypeScript errors after update

The distrijs API may have changed. Check:
1. The distrijs changelog for breaking changes
2. Update your code to match the new API

### Peer dependency warnings

The vendored `@distri/react` has peer dependencies. Ensure your `package.json` includes compatible versions of:
- `react` (>=18.0.0)
- `react-dom` (>=18.0.0)

## Related Files

| File | Purpose |
|------|---------|
| `ui/vendor/distri-core/` | Vendored @distri/core package |
| `ui/vendor/distri-react/` | Vendored @distri/react package |
| `ui/package.json` | References vendor packages |
| `distrijs/packages/core/` | Source for @distri/core |
| `distrijs/packages/react/` | Source for @distri/react |
