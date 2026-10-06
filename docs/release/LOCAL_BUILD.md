# Local Android release-candidate build (Windows)

The repository path contains Hebrew characters; Gradle/CMake/NDK fail on non-ASCII paths. Build from an ASCII
mirror with an ASCII toolchain (see `docs/ENVIRONMENT.md`).

## Prerequisites (this machine)
| Item | Location |
| --- | --- |
| JDK 17 | `C:\ak-jdk` |
| Android SDK subset (build-tools 36, platform android-36, NDK 27.1.12297006, CMake 3.22.1, platform-tools) | `C:\ak-sdk` |
| Gradle user home (caches, Gradle 9.3.1 distribution) | `C:\ak-gradle` |

Using `GRADLE_USER_HOME=C:\ak-gradle` also keeps the build independent of `~/.gradle` (which belongs to other
projects and must not be read or modified).

## Steps
```powershell
# 1. ASCII mirror (exclude only the ROOT native/git folders — a bare `/XD android` would also drop
#    node_modules/**/android and break prebuild)
$src = "<repo path>"
robocopy $src C:\ctb /MIR /XD "$src\.git" "$src\.expo" "$src\android" "$src\ios"
```
```bash
# 2. Generate the native project (CNG; /android is never committed)
cd /c/ctb && npx expo prebuild --platform android --no-install

# 3. Release build (arm64 only for the device RC)
export JAVA_HOME='C:\ak-jdk' ANDROID_HOME='C:\ak-sdk' ANDROID_SDK_ROOT='C:\ak-sdk' GRADLE_USER_HOME='C:\ak-gradle' NODE_ENV=production
cd /c/ctb/android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon
# → android/app/build/outputs/apk/release/app-release.apk
```

## Verification
```bash
AAPT=/c/ak-sdk/build-tools/36.0.0/aapt2.exe
"$AAPT" dump permissions app-release.apk          # merged-manifest permissions
"$AAPT" dump badging app-release.apk | head        # package / versionCode / versionName
adb install -r app-release.apk                     # upgrade-in-place keeps app data
```

## Signing
The generated project signs `release` with the template **debug keystore** — suitable only for local installation
tests. A store release needs the owner's upload keystore (never committed); configure it outside the repository
(e.g. EAS credentials or a local, git-ignored `keystore.properties`). Publication is outside V1 build scope.

## Disk
About 0.5 GB for the mirror plus several GB of Gradle/NDK intermediates. Delete `C:\ctb` after the RC is verified.
