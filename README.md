# NDA Data Dictionary Explorer 🔍

A friendly web application for exploring and validating NIH National Data Archive (NDA) data structures and CSV files.

## ✨ Features

### 🔎 Structure Search
- Search through NDA data structures
- View field requirements and data formats
- Get detailed info about each data structure

### 📊 CSV Validation
- Upload your CSV files
- Get instant validation against NDA requirements
- Smart header matching and suggestions
- Download corrected CSV files

### 🎯 Field-Based Search
- Find data structures by their field names
- See which structures contain your variables
- Get instant matches and compatibility scores

## 🚀 Getting Started

First, make sure that you have added your public SSH key to GitHub:

To check for keys on your machine:
```bash
cat ~/.ssh/id_rsa.pub
```

If you see a key, add it to SSH and GPG keys in GitHub settings.
If not, run:
```bash
ssh-keygen -t rsa
```
This will generate keys, then add to github.

Now, you can clone to your computer:
```bash
git clone git@github.com:IMPACT-MH/ndaValidator.git
cd ndaValidator
```

If npm is not installed:
```bash
# First install brew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# After brew is installed
brew install node

# Install Next.js
npm install next
```

Start the development server:
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to start exploring! 🎉

## 💡 Quick Usage

1. 🔍 **Search**: Enter a structure name or description
2. 📁 **Upload**: Drop your CSV file to validate
3. ✅ **Validate**: Get instant feedback and suggestions
4. 💾 **Export**: Download your corrected CSV

## 🤝 Contributing

Contributions welcome! Feel free to open issues and submit PRs.

## 📝 License

[Add appropriate license information]
