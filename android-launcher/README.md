# Living World Home — Android launcher prototype

Separate experimental native Android launcher. The production web app is unchanged.

## Features in this prototype
- Android HOME and LAUNCHER intent filters: can appear as an optional default launcher.
- Clock/date and Living World shortcut (opens existing HTTPS app).
- Local installed-app drawer and text search via Android LauncherApps, opening real apps in their own activities.
- No broad QUERY_ALL_PACKAGES permission. Does not upload or export installed-app inventory.
- Button to launch Android Home settings; users can restore Samsung One UI Home anytime.

## Build and install
Open **android-launcher/** as a separate Android Studio project with JDK 17 and Android SDK 35; sync Gradle and run on an Android device. Choose Living World Home in Android default Home settings only after testing. Android Studio/Gradle has not yet been run against this prototype.

## Important limitations / next phases
This is a native launcher, **not an Android operating system**. Real apps open normally outside the launcher. No private app data is accessed. It does not support widgets, wallpapers, notifications, folders, shortcuts, Samsung edge features, native VoIP routing, work profiles, or reliable background calls yet. The in-world app currently opens in the device browser; embedding it securely in a native activity comes later. Home replacement is opt-in, and the default Samsung launcher remains available.
