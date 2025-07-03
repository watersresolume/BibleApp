# GitHub Search Guide for NLT Bible Data

## 🎯 Exact Search Terms to Use

### **Primary Searches:**
1. **"NLT bible JSON"** - Most likely to find complete datasets
2. **"bible data NLT"** - Alternative search term
3. **"scripture NLT"** - Broader search
4. **"new living translation JSON"** - Full name search
5. **"bible-api NLT"** - API-related datasets

### **Secondary Searches:**
1. **"bible translations JSON"** - May include NLT
2. **"scripture database NLT"** - Database format
3. **"bible text NLT"** - Text format
4. **"holy bible NLT"** - Alternative terms

## 📋 Specific Repositories to Check

### **Known Bible Data Repositories:**
1. **https://github.com/scrollmapper/bible_databases**
   - Large collection of Bible databases
   - May have NLT in various formats

2. **https://github.com/bibleapi/bibleapi-bibles-json**
   - Bible API project
   - Multiple translations including NLT

3. **https://github.com/scrollmapper/bible_versions**
   - Bible versions repository
   - Check for NLT data

4. **https://github.com/JohnRDOrazio/LiturgicalCalendar**
   - May have Bible data as part of larger project

5. **https://github.com/openbibleinfo/Bible-Data**
   - Open Bible Info project
   - Various Bible datasets

## 🔍 How to Search Effectively

### **Step 1: Use GitHub Advanced Search**
1. Go to: https://github.com/search
2. Use these search terms in order:
   - `NLT bible JSON`
   - `bible data NLT`
   - `scripture NLT`

### **Step 2: Filter Results**
- **Language**: JavaScript, JSON, or All
- **Sort by**: Most stars or Recently updated
- **Size**: Look for repositories > 1MB (likely to have complete data)

### **Step 3: Check Repository Contents**
Look for files like:
- `nlt.json`
- `NLT.json`
- `bible-nlt.json`
- `new-living-translation.json`
- `scriptures/nlt/`
- `data/nlt/`

## 📁 What to Look For

### **Good Signs:**
- ✅ Repository size > 1MB
- ✅ Recent updates
- ✅ Multiple stars
- ✅ Clear documentation
- ✅ JSON or JavaScript files
- ✅ Mentions "NLT" or "New Living Translation"

### **Avoid:**
- ❌ Very small repositories (< 100KB)
- ❌ No recent activity
- ❌ No documentation
- ❌ Binary files only

## 🚀 Quick Action Plan

### **Search Order:**
1. Search: `"NLT bible JSON"`
2. Search: `"bible data NLT"`
3. Check the specific repositories listed above
4. Look for files with "nlt" in the name

### **Download Process:**
1. Find a repository with NLT data
2. Look for JSON files
3. Download the raw JSON file
4. Convert to the format needed for nlt-data.js

## 📝 Expected File Formats

### **Format 1: Book-based JSON**
```json
{
  "Genesis": {
    "1": {
      "1": "In the beginning God created the heavens and the earth.",
      "2": "The earth was formless and empty..."
    }
  }
}
```

### **Format 2: Verse-based JSON**
```json
[
  {
    "book": "Genesis",
    "chapter": 1,
    "verse": 1,
    "text": "In the beginning God created the heavens and the earth."
  }
]
```

### **Format 3: API-style JSON**
```json
{
  "verses": [
    {
      "verse": 1,
      "text": "In the beginning God created the heavens and the earth."
    }
  ]
}
```

## 🎯 Success Indicators

You've found good NLT data when:
- ✅ File contains all 66 books
- ✅ Has verse numbers
- ✅ Text is properly formatted
- ✅ No missing verses
- ✅ File size is reasonable (1-5MB)

## 🔧 Conversion Process

Once you find the data:
1. **Download** the JSON file
2. **Check** the format
3. **Convert** to match nlt-data.js structure
4. **Test** with the implementation guide
5. **Replace** placeholder data

## 📞 Need Help?

If you find a repository but need help:
1. **Share the repository URL**
2. **Describe the file format**
3. **I'll help you convert it** to the right format

This guide should help you find complete NLT Bible data quickly! 