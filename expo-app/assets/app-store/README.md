# App Store Assets

This directory contains assets for App Store and Play Store submissions.

## Required Assets

### iOS App Store
- **Icon (1024x1024px)**: `app-icon.png` - Main app icon for App Store
- **Screenshots (iPhone)**:
  - 6.7" Display (1290x2796px): `screenshots/iphone-6.7-1.png`, `iphone-6.7-2.png`, `iphone-6.7-3.png`
  - 6.5" Display (1242x2688px): `screenshots/iphone-6.5-1.png`, `iphone-6.5-2.png`, `iphone-6.5-3.png`
  - 5.5" Display (1242x2208px): `screenshots/iphone-5.5-1.png`, `iphone-5.5-2.png`, `iphone-5.5-3.png`

### Android Play Store
- **Icon (512x512px)**: `play-store-icon.png`
- **Feature Graphic (1024x500px)**: `feature-graphic.png`
- **Screenshots (Phone)**:
  - Minimum: 320px, Maximum: 3840px
  - `screenshots/android-phone-1.png`, `android-phone-2.png`, `android-phone-3.png`

## Screenshot Themes

1. **Dashboard** - Main app overview showing stats and recent sessions
2. **Session View** - Interactive coding session with Claude
3. **Repository Management** - Connected repositories and issue tracking
4. **Settings** - User preferences and configuration

## Generating Screenshots

Use Expo's screenshot tool or EAS CLI:

```bash
# Install expo-screenshots
npx expo install expo-screenshots

# Configure screenshots
# Create app-store.json configuration file

# Capture screenshots
npx expo-screenshots
```

## Asset Guidelines

- **File Format**: PNG or JPG (PNG recommended for icons)
- **Color Space**: sRGB
- **No Transparency**: Icons should not have transparent backgrounds
- **Safe Area**: Keep important UI elements away from edges

## Current Status

- [x] App icons configured in app.json
- [x] Splash screen configured
- [x] Adaptive icons configured
- [ ] App store screenshots (use EAS Build or simulator screenshots)
- [ ] Feature graphic (1024x500px)

## Tools

- **Expo Image Picker**: `npx expo-image-picker` - Generate adaptive icons
- **EAS Screenshots**: `eas screenshots` - Automated screenshot capture
- **Figma/Sketch**: Design mockups for marketing materials
