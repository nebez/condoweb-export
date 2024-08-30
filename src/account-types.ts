// This is a best guess of the account type mappings inferred by interacting
// with the CondoWeb web app filters on the Financials > Budgets filter page
// It's possible this actually differs per organization (association) and may
// require further investigation. Use mapping at your own risk.
export const enum AccountType {
    Assets = 0,
    Expenses = 1,
    Receivables = 2,
    Liabilities = 3,
    Revenues = 4,
    Suppliers = 5,
    Capital = 6,
    Owners = 7,
}
