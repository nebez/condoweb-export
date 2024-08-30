#!/usr/bin/env bun
import { fs, sleep } from 'zx';

import type { default as ExampleFinancialYears } from './examples/get-financial-years.json';
import type { default as ExampleBalanceBudgets } from './examples/get-balance-budgets-singleyear.json';
import type { default as ExamplePayableBalances } from './examples/get-payable-balances.json';
import type { default as ExampleReceivableBalances } from './examples/get-receivable-balances.json';
import type { default as ExampleAllAccounts } from './examples/get-all-accounts.json';
import type { default as ExampleAccountFinancialYear } from './examples/get-financial-years-singleaccount.json';
import type { default as ExampleAccountStatement } from './examples/get-account-statement-singleaccount.json';
import type { default as ExampleAccountStatementTransactionData } from './examples/get-account-statement-transaction-data-single.json';

const AUTH_TOKEN = '________________';
const MANAGER_SLUG = 'prestantia';
const MANAGER_ID = 'cf0d81c1-b872-4f0a-0db3-08d8ff5a8751';
const ASSOCIATION_ID = '________________';

const commonRequestHeaders = {
    token: AUTH_TOKEN,
    'association-id': ASSOCIATION_ID,
    'manager-id': MANAGER_ID,
    'user-agent':
        'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
};

const getApiUrl = (path: string) => `https://${MANAGER_SLUG}.condoweb.app/api/v1${path}`;

const downloadIfMissing = async (localPath: string, onMiss: () => Promise<NonNullable<unknown>>) => {
    if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
        console.error(`${localPath} already exists, skipping`);
        return fs.readJsonSync(localPath);
    }

    console.error(`${localPath} does not exist, downloading`);
    const content = await onMiss();
    fs.outputJsonSync(localPath, content);
    return content;
};

const main = async () => {
    const financialYears: typeof ExampleFinancialYears = await downloadIfMissing(
        './data/financials/get-financial-years.json',
        () =>
            fetch(getApiUrl('/financials/get-financial-years'), {
                headers: commonRequestHeaders,
            }).then((r) => r.json())
    );

    const balanceBudgets: typeof ExampleBalanceBudgets[] = [];

    for (const financialYear of financialYears.data) {
        const financialYearBudget: typeof ExampleBalanceBudgets = await downloadIfMissing(
            `./data/financials/get-balance-budgets/${financialYear.displayYears}.json`,
            () =>
                fetch(getApiUrl(`/financials/get-balance-budgets/${financialYear.nomAbrege}`), {
                    headers: commonRequestHeaders,
                }).then((r) => r.json())
        );

        balanceBudgets.push(financialYearBudget);
    }

    await downloadIfMissing(
        './data/financials/get-payable-balances.json',
        () =>
            fetch(getApiUrl('/financials/get-payable-balances'), {
                headers: commonRequestHeaders,
            }).then((r) => r.json())
    ) as typeof ExamplePayableBalances;

    await downloadIfMissing(
        './data/financials/get-receivable-balances.json',
        () =>
            fetch(getApiUrl('/financials/get-receivable-balances'), {
                headers: commonRequestHeaders,
            }).then((r) => r.json())
    ) as typeof ExampleReceivableBalances;

    const allAccounts: typeof ExampleAllAccounts = await downloadIfMissing('./data/financials/get-all-accounts.json', () =>
        fetch(getApiUrl('/financials/get-all-accounts'), {
            headers: commonRequestHeaders,
        }).then((r) => r.json())
    );

    const accountFinancialYears = new Map<number, typeof ExampleAccountFinancialYear>();

    for (const account of allAccounts.data) {
        const accountFinancialYear: typeof ExampleAccountFinancialYear = await downloadIfMissing(
            `./data/financials/get-account-statements/${account.accountNumber}/financial-years.json`,
            () =>
                fetch(getApiUrl(`/financials/get-financial-years/${account.accountNumber}/`), {
                    headers: commonRequestHeaders,
                }).then((r) => r.json())
        );

        accountFinancialYears.set(account.accountNumber, accountFinancialYear);
    }

    const allAccountIds = allAccounts.data.map((e) => e.accountNumber);

    const combinations = allAccountIds.flatMap(
        (accountId) =>
            accountFinancialYears
                .get(accountId)
                ?.data.filter((year) => year.userHasData)
                .map((year) => ({ accountId, yearId: year.nomAbrege })) ?? []
    );

    const accountStatements: typeof ExampleAccountStatement[] = [];
    let accountStatementProgress = 0;

    for (const { accountId, yearId } of combinations) {
        accountStatementProgress++;
        const targetFile = `./data/financials/get-account-statements/${accountId}/${yearId}.json`;

        const accountStatement: typeof ExampleAccountStatement = await downloadIfMissing(targetFile, () =>
            fetch(
                getApiUrl(
                    `/financials/get-account-statement/${encodeURIComponent(accountId)}?isNextYear=false&associationId=${ASSOCIATION_ID}&shortenedName=${encodeURIComponent(yearId)}`
                ),
                {
                    headers: commonRequestHeaders,
                }
            ).then(async (r) => {
                // introduce a bit of delay to avoid being mean to the service
                await sleep(300);
                return r.json();
            })
        );
        accountStatements.push(accountStatement);
        console.log(`Progress: ${accountStatementProgress}/${combinations.length}`);
    }

    const allTransactionIds = accountStatements.flatMap((e) =>
        e.data.flatMap((e) => e.transactions.map((e) => e.transactionNumber))
    );
    const uniqueTransactionIds = [...new Set(allTransactionIds)];
    console.log(`${uniqueTransactionIds.length} unique transaction ids found`);

    const transactions: typeof ExampleAccountStatementTransactionData[] = [];
    let transactionProgress = 0;

    for (const transactionId of uniqueTransactionIds) {
        transactionProgress++;
        const transaction: typeof ExampleAccountStatementTransactionData = await downloadIfMissing(
            `./data/financials/get-account-statement-transaction-data/${transactionId}.json`,
            () =>
                fetch(getApiUrl(`/financials/get-account-statement-transaction-data`), {
                    headers: {
                        ...commonRequestHeaders,
                        'content-type': 'application/x-www-form-urlencoded',
                    },
                    method: 'POST',
                    body: new URLSearchParams({
                        transactionNumber: transactionId.toString(),
                        accountNumber: '0',
                        associationId: ASSOCIATION_ID,
                    }),
                }).then(async (r) => {
                    // introduce a bit of delay to avoid being mean to the service
                    await sleep(300);
                    return r.json();
                })
        );
        transactions.push(transaction);
        console.log(`Progress: ${transactionProgress}/${uniqueTransactionIds.length}`);
    }
};

main();
