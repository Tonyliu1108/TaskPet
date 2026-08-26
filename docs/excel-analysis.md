# Excel Analysis

TaskPet accepts `.xlsx` uploads through FastAPI. Files are stored in an ignored local runtime directory and identified by generated file IDs. The A1 service selects a worksheet and header row, maps supported aliases, validates numeric sales data, and computes deterministic metrics before any AI call.

The only required logical field is sales amount. Supported optional dimensions include date, region, product, and quantity. Common Chinese aliases include `销售日期`, `区域`, `产品名称`, `销售额`, and `销量`; English aliases are also supported. Duplicate matches are rejected rather than guessed.

Computed results include totals, averages, valid-row counts, monthly trend, region and product rankings, quantity summaries, and data-quality diagnostics. A2 can send the deterministic evidence registry to an optional OpenAI-compatible insight provider. A3 displays the local metrics and validated narrative in the result dashboard and local task history.

Generate safe sample data from the repository root:

```bash
python server/scripts/generate_demo_excel.py --output taskpet_demo_sales.xlsx
```

The generated workbook is deterministic and entirely synthetic. Generated `.xlsx` files are ignored and are not included in the repository.
