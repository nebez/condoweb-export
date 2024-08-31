#!/usr/bin/env bun
import { fs, sleep, minimist, chalk, glob } from 'zx';
import { generateCsv, asString } from 'export-to-csv';
import { AccountTypes } from './account-types';

import type { default as ExampleFinancialYears } from './examples/get-financial-years.json';
import type { default as ExampleBalanceBudgets } from './examples/get-balance-budgets-singleyear.json';
import type { default as ExamplePayableBalances } from './examples/get-payable-balances.json';
import type { default as ExampleReceivableBalances } from './examples/get-receivable-balances.json';
import type { default as ExampleAllAccounts } from './examples/get-all-accounts.json';
import type { default as ExampleAccountStatement } from './examples/get-account-statement-singleaccount.json';
import type { default as ExampleAccountStatementTransactionData } from './examples/get-account-statement-transaction-data-single.json';

const main = async () => {
    const financialYears: typeof ExampleFinancialYears = fs.readJsonSync('./data/financials/get-financial-years.json');
    const financialYearsCsv = generateCsv({ useKeysAsHeaders: true })(financialYears.data);
    fs.outputFileSync('./csv/financial-years.csv', asString(financialYearsCsv));

    const currentFinancialYear = financialYears.data.find(year => year.isCurrent);

    const accountStatementFiles = await glob('./data/financials/get-account-statements/**/*.json');
    const accountStatementMap = new Map<number, {
        balance: number;
        address: string;
        accountType: number;
        transactions: typeof ExampleAccountStatement['data'][0]['transactions']
    }>();
    for (const accountStatementFile of accountStatementFiles) {
        if (accountStatementFile.endsWith('financial-years.json')) continue;
        const accountStatements: typeof ExampleAccountStatement = fs.readJsonSync(accountStatementFile);

        for (const accountStatement of accountStatements.data) {
            if (!accountStatementMap.has(accountStatement.accountNumber)) {
                accountStatementMap.set(accountStatement.accountNumber, {
                    balance: 0,
                    address: '',
                    accountType: accountStatement.accountType,
                    transactions: [],
                });
            }

            // Push in all the transactions
            accountStatementMap.get(accountStatement.accountNumber)!.transactions.push(...accountStatement.transactions);

            // If the account statement is for the current financial year, we can use
            // the balance and address.
            const isCurrentFinancialYear = accountStatementFile.endsWith(`${currentFinancialYear!.nomAbrege}.json`)
            if (isCurrentFinancialYear) {
                accountStatementMap.get(accountStatement.accountNumber)!.balance = accountStatement.balance;
                accountStatementMap.get(accountStatement.accountNumber)!.address = accountStatement.address;
            }
        }
    }

    const accountStatements: Array<{ accountNumber: number, accountType: number, accountTypeName: string } & Omit<typeof ExampleAccountStatement['data'][0]['transactions'][0], 'refusedData'>> = [];
    for (const [accountNumber, accountStatement] of accountStatementMap.entries()) {
        for (const transaction of accountStatement.transactions) {
            const { refusedData, ...transactionWithoutRefusedData } = transaction;
            accountStatements.push({
                accountNumber,
                accountType: accountStatement.accountType,
                accountTypeName: AccountTypes[accountStatement.accountType],
                ...transactionWithoutRefusedData,
            });
        }
    }

    // Sort the statements by transaction date asc, account number asc
    const accountStatementsCsv = generateCsv({ useKeysAsHeaders: true })(accountStatements.sort((a, b) => {
        if (a.transactionDate === b.transactionDate) {
            return a.accountNumber - b.accountNumber;
        }
        return a.transactionDate.localeCompare(b.transactionDate);
    }));
    fs.outputFileSync('./csv/account-statements.csv', asString(accountStatementsCsv));

    const accounts: typeof ExampleAllAccounts = fs.readJsonSync('./data/financials/get-all-accounts.json');
    const accountsCsv = generateCsv({ useKeysAsHeaders: true })(accounts.data.map(account => ({
        accountTypeName: AccountTypes[account.accountType],
        ...account,
        unitNumber: account.unitNumber?.trim() ?? '',
        balance: accountStatementMap.get(account.accountNumber)?.balance ?? 0,
        address: accountStatementMap.get(account.accountNumber)?.address ?? '',
    })));
    fs.outputFileSync('./csv/accounts.csv', asString(accountsCsv));

    const payableBalances: typeof ExamplePayableBalances = fs.readJsonSync('./data/financials/get-payable-balances.json');
    const payableBalancesCsv = generateCsv({ useKeysAsHeaders: true })(payableBalances.data.map(balance => ({
        accountTypeName: AccountTypes[balance.accountType],
        ...balance,
        unitNumber: balance.unitNumber?.trim() ?? '',
    })));
    fs.outputFileSync('./csv/payable-balances.csv', asString(payableBalancesCsv));

    const receivableBalances: typeof ExampleReceivableBalances = fs.readJsonSync('./data/financials/get-receivable-balances.json');
    const receivableBalancesCsv = generateCsv({ useKeysAsHeaders: true })(receivableBalances.data.map(balance => ({
        accountTypeName: AccountTypes[balance.accountType],
        ...balance,
        unitNumber: balance.unitNumber?.trim() ?? '',
    })));
    fs.outputFileSync('./csv/receivable-balances.csv', asString(receivableBalancesCsv));

    // Get all the balance budgets for each financial year and turn into a csv.
    const balanceBudgetFiles = await glob('./data/financials/get-balance-budgets/*.json');
    for (const balanceBudgetFile of balanceBudgetFiles) {
        const balanceBudget: typeof ExampleBalanceBudgets = fs.readJsonSync(balanceBudgetFile);
        const balanceBudgetCsv = generateCsv({ useKeysAsHeaders: true })(balanceBudget.data.map(budget => ({
            accountTypeName: AccountTypes[budget.accountType],
            ...budget,
        })));
        fs.outputFileSync(`./csv/annual-budgets/${balanceBudgetFile.split('/').pop()!.replace('.json', '.csv')}`, asString(balanceBudgetCsv));
    }

    // Get all the statement transaction data and turn into a csv.
    const statementTransactionDataFiles = await glob('./data/financials/get-account-statement-transaction-data/*.json');
    const statementTransactions: typeof ExampleAccountStatementTransactionData['data'] = [];
    for (const statementTransactionDataFile of statementTransactionDataFiles) {
        const statementTransactionData: typeof ExampleAccountStatementTransactionData = fs.readJsonSync(statementTransactionDataFile);
        statementTransactions.push(...statementTransactionData.data);
    }

    const statementTransactionDataCsv = generateCsv({ useKeysAsHeaders: true })(statementTransactions.sort((a, b) => a.transactionDate.localeCompare(b.transactionDate)));
    fs.outputFileSync(`./csv/transactions.csv`, asString(statementTransactionDataCsv));

    // Get all account data and turn it into a massive CSV.
};

main();
