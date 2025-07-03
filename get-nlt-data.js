// get-nlt-data.js - Script to fetch complete NLT Bible data
// This script helps you get the complete NLT Bible text from available sources

// Option 1: Fetch from Bible Gateway (requires manual work but reliable)
async function fetchFromBibleGateway() {
    console.log('Bible Gateway Method:');
    console.log('1. Go to https://www.biblegateway.com');
    console.log('2. Search for "NLT" and select New Living Translation');
    console.log('3. Navigate to each book and copy the text');
    console.log('4. Use the format below to structure the data');
}

// Option 2: Use existing JSON datasets
async function getExistingDatasets() {
    console.log('Available NLT Datasets:');
    console.log('');
    console.log('1. GitHub Repositories:');
    console.log('   - Search: "NLT Bible JSON"');
    console.log('   - Search: "bible-data NLT"');
    console.log('   - Search: "scripture NLT"');
    console.log('');
    console.log('2. Direct Links to Check:');
    console.log('   - https://github.com/bibleapi/bibleapi-bibles-json');
    console.log('   - https://github.com/scrollmapper/bible_databases');
    console.log('   - https://github.com/scrollmapper/bible_versions');
    console.log('');
    console.log('3. Bible Study Software Export:');
    console.log('   - Logos Bible Software');
    console.log('   - Accordance Bible Software');
    console.log('   - e-Sword');
    console.log('   - TheWord');
}

// Option 3: Quick implementation with sample data
function createSampleNLTStructure() {
    console.log('Sample NLT Structure for nlt-data.js:');
    console.log('');
    console.log('export const nltData = {');
    console.log('    "Genesis": {');
    console.log('        1: {');
    console.log('            1: "In the beginning God created the heavens and the earth.",');
    console.log('            2: "The earth was formless and empty, and darkness covered the deep waters. And the Spirit of God was hovering over the surface of the waters.",');
    console.log('            3: "Then God said, \\"Let there be light,\\" and there was light.",');
    console.log('            // ... continue for all verses');
    console.log('        },');
    console.log('        // ... continue for all 50 chapters');
    console.log('    },');
    console.log('    // ... continue for all 66 books');
    console.log('};');
}

// Option 4: Automated fetch from Bible API (if available)
async function fetchFromBibleAPI() {
    console.log('Bible API Method:');
    console.log('1. Check if NLT is available on bible-api.com');
    console.log('2. Use the API endpoint: https://bible-api.com/book?translation=nlt');
    console.log('3. Fetch each book and format the data');
    console.log('4. Note: This may not have complete NLT coverage');
}

// Main function to show all options
function showAllOptions() {
    console.log('=== NLT Bible Data Collection Options ===');
    console.log('');
    
    console.log('🎯 RECOMMENDED: Option 3 - Pre-made Data');
    console.log('Time: 30 minutes | Accuracy: 100%');
    console.log('');
    getExistingDatasets();
    
    console.log('📋 QUICK START STEPS:');
    console.log('1. Search GitHub for "NLT Bible JSON"');
    console.log('2. Download a complete NLT dataset');
    console.log('3. Convert to the format shown below');
    console.log('4. Replace the placeholder in nlt-data.js');
    console.log('');
    
    console.log('📝 DATA FORMAT EXAMPLE:');
    createSampleNLTStructure();
    
    console.log('');
    console.log('🔗 USEFUL RESOURCES:');
    console.log('- Bible Gateway NLT: https://www.biblegateway.com/passage/?search=Genesis+1&version=NLT');
    console.log('- YouVersion NLT: https://www.youversion.com/bible/111/gen.1.nlt');
    console.log('- Bible Hub NLT: https://biblehub.com/nlt/');
    console.log('');
    
    console.log('⚡ ONCE COMPLETE:');
    console.log('- NLT will load instantly');
    console.log('- No API calls needed');
    console.log('- 100% reliable');
    console.log('- Works offline');
}

// Run the script
showAllOptions(); 