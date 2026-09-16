Phrases: на листам, на лист ам, на list.am, на list am, объявления list.am, товары на list.am, купить на list.am, поиск на list.am, list.am
Combinations: найди, сравни, покажи, поищи, закажи, купи | листам, list.am, list am
Keywords: list.am

When searching or analyzing classifieds and products on List.am (Armenia):

1. **Search Endpoint Structure**:
   - Main Search: `https://www.list.am/category?q=QUERY`

2. **Sorting & Filter Parameters**:
   - **Price Range Parameters**:
     - `price1=VALUE`: Minimum price (от)
     - `price2=VALUE`: Maximum price (до)
   - **Currency Parameter (`crc`)**:
     - `crc=0` — AMD (֏, default)
     - `crc=1` — USD ($)
     - `crc=3` — RUB (₽)
     - `crc=4` — EUR (€)
   - **URL Examples**:
     - Range in AMD: `https://www.list.am/category?q=QUERY&price1=10000&price2=50000&crc=0`
     - Range in USD: `https://www.list.am/category?q=QUERY&price1=100&price2=500&crc=1`
     - Min or Max only: `...&price1=50000` or `...&price2=200000`
   - Direct search query: `?q=QUERY`

3. **Information Extraction**:
   - Extract listing title, price (AMD/USD), location (e.g. Yerevan, Kentron, etc.), date posted, and condition (new/used).
   - Direct clickable Markdown links to the specific listing URL (`https://www.list.am/item/...`).
   - Group results by price and condition (New vs Used) in a clear Markdown table.
