#!/bin/bash
# Build Moremi Flutter app for iOS (from PWA Build/)
#
# PREREQUISITES (run once):
# 1. Install Xcode from App Store
# 2. Run: sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
# 3. Run: sudo xcodebuild -runFirstLaunch
# 4. Install CocoaPods: sudo gem install cocoapods
# 5. Apple Developer account (for App Store or device testing)
#
# USAGE:
#   ./build-ios.sh              # Build for simulator / archive (no codesign)
#   ./build-ios.sh --codesign   # Build with codesigning (requires dev account)
#
# After build: open ios/Runner.xcworkspace in Xcode to run on simulator or archive for App Store.

set -e

cd "$(dirname "$0")/PWA Build"

echo "Building iOS app..."
BUILD_ARGS="--release --dart-define=API_KEY=98394a83034f3db48e5acd3ef54bd622c5748ca5bb4fb3ff39c052319711c9a9"
if [[ "$*" == *"--codesign"* ]]; then
  flutter build ios $BUILD_ARGS
else
  flutter build ios $BUILD_ARGS --no-codesign
fi

echo ""
echo "✓ iOS build complete!"
echo ""
echo "Next steps:"
echo "  1. Open in Xcode: open \"$(pwd)/ios/Runner.xcworkspace\""
echo "  2. Select your development team in Signing & Capabilities"
echo "  3. Choose a simulator or connected device"
echo "  4. Click Run (▶) or Product → Archive for App Store"
echo ""
