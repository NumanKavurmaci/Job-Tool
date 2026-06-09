# 🔐 User Directory

This folder is for local candidate data. Keep personal files private and out of Git.

## 📁 Files

| File | Purpose | Commit? |
| --- | --- | --- |
| `profile.example.json` | Generic starter profile for new users and tests. | Yes |
| `profile.json` | Your personal candidate profile override. | No |
| `resume.pdf` | Optional default resume used by commands when `--resume` is omitted. | No |
| Other resume files | Alternate local resumes for experiments. | No |

## 🔎 Load Order

1. `user/profile.json`
2. `user/profile.example.json`
3. built-in generic defaults

Use `profile.example.json` as the shape reference, then create a local `profile.json` with your own data.
