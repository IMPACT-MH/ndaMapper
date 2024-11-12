# NDA Data Structure Validator 🔍

A friendly web application for exploring NIMH Data Archive (NDA) Data Structures and validating CSV files against the Data Dictionary. This tool connects directly to the NDA API, ensuring all data structure definitions and validations are current with NDA's latest requirements.

## ✨ Features

### 🔎 Structure Search
- Real-time search through current NDA data structures
- View up-to-date field requirements and data formats
- Access the latest structure definitions directly from NDA

### 📊 CSV Validation
- Upload your CSV files
- Validate against current NDA requirements
- Smart header matching and suggestions
- Download corrected CSV files

### 🎯 Field-Based Search
- Find data structures by their field names
- See which structures contain your variables
- Get instant matches and compatibility scores

## 🛠️ Development Guide

### Prerequisites
- GitHub account with SSH access
- Node.js and npm
- Homebrew (for macOS users)

### Setting up SSH for GitHub

Check for existing SSH keys:
```bash
cat ~/.ssh/id_rsa.pub
```

If no key exists, generate one:
```bash
ssh-keygen -t rsa
```

Add the key to your GitHub account:
1. Copy your public key (the output of `cat ~/.ssh/id_rsa.pub`)
2. Go to GitHub → Settings → SSH and GPG keys
3. Click "New SSH key" and paste your key

### Installing Dependencies

If you don't have Homebrew installed (macOS):
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Install Node.js if needed:
```bash
brew install node
```

### Setting up the Project

Clone the repository:
```bash
git clone git@github.com:IMPACT-MH/ndaValidator.git
cd ~/ndaValidator
```

Install project dependencies:
```bash
npm install
```

Start the development server:
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to start developing! 🎉

### 🔌 API Integration

This application integrates with the following NDA API endpoints:
- Structure Search: `/api/datadictionary/v2/datastructure`
- Structure Details: `/api/datadictionary/datastructure/{shortName}`
- Field Lookup: `/api/datadictionary/datastructure/dataElement/{field}`

All data is fetched in real-time, ensuring validations always match current NDA requirements.

## 💡 Quick Usage

1. 🔍 **Search**: Enter a structure name or description
2. 📁 **Upload**: Drop your CSV file to validate
3. ✅ **Validate**: Get instant feedback and suggestions
4. 💾 **Export**: Download your corrected CSV

## 🤝 Contributing

Contributions welcome! Feel free to open issues and submit PRs.

## 📝 License

[Add appropriate license information]
