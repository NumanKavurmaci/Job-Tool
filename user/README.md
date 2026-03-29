# User Directory

- `profile.json`: local personal candidate profile used by the app. Keep this file private.
- `profile.example.json`: generic starter profile for new users.
- `resume.pdf` or another supported resume file: optional local default resume used by CLI commands when `--resume` is omitted.

The loader reads `user/profile.json` first. If it is missing, it falls back to
`user/profile.example.json`, and only then to the built-in generic defaults in code.
