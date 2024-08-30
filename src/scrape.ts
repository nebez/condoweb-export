#!/usr/bin/env bun
import { fs, sleep, minimist, chalk } from 'zx';

import type { default as ExampleFinancialYears } from './examples/get-financial-years.json';
import type { default as ExampleBalanceBudgets } from './examples/get-balance-budgets-singleyear.json';
import type { default as ExamplePayableBalances } from './examples/get-payable-balances.json';
import type { default as ExampleReceivableBalances } from './examples/get-receivable-balances.json';
import type { default as ExampleAllAccounts } from './examples/get-all-accounts.json';
import type { default as ExampleAccountFinancialYear } from './examples/get-financial-years-singleaccount.json';
import type { default as ExampleAccountStatement } from './examples/get-account-statement-singleaccount.json';
import type { default as ExampleAccountStatementTransactionData } from './examples/get-account-statement-transaction-data-single.json';

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

const main = async ({ authToken, managerSlug, managerId, associationId }: { authToken: string; managerSlug: string; managerId: string; associationId: string }) => {
    const fetchCondoApi = async (apiPath: string, fetchOptions: RequestInit = {}) => {
        const response = await fetch(`https://${managerSlug}.condoweb.app/api/v1${apiPath}`, {
            ...fetchOptions,
            headers: {
                ...fetchOptions.headers ?? {},
                token: authToken,
                'association-id': associationId,
                'manager-id': managerId,
                'user-agent':
                    'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
                    },
        });
        if (response.status !== 200) {
            const errorBody = await response.text();
            throw new Error(`Failed to fetch ${apiPath} (${response.status}): ${errorBody}`);
        }
        return response.json();
    };

    const financialYears: typeof ExampleFinancialYears = await downloadIfMissing(
        './data/financials/get-financial-years.json',
        () => fetchCondoApi('/financials/get-financial-years')
    );

    const balanceBudgets: typeof ExampleBalanceBudgets[] = [];

    for (const financialYear of financialYears.data) {
        const financialYearBudget: typeof ExampleBalanceBudgets = await downloadIfMissing(
            `./data/financials/get-balance-budgets/${financialYear.displayYears}.json`,
            () =>
                fetchCondoApi(`/financials/get-balance-budgets/${financialYear.nomAbrege}`)
        );

        balanceBudgets.push(financialYearBudget);
    }

    await downloadIfMissing(
        './data/financials/get-payable-balances.json',
        () =>
            fetchCondoApi('/financials/get-payable-balances')
    ) as typeof ExamplePayableBalances;

    await downloadIfMissing(
        './data/financials/get-receivable-balances.json',
        () =>
            fetchCondoApi('/financials/get-receivable-balances')
    ) as typeof ExampleReceivableBalances;

    const allAccounts: typeof ExampleAllAccounts = await downloadIfMissing('./data/financials/get-all-accounts.json', () =>
        fetchCondoApi('/financials/get-all-accounts')
    );

    const accountFinancialYears = new Map<number, typeof ExampleAccountFinancialYear>();

    for (const account of allAccounts.data) {
        const accountFinancialYear: typeof ExampleAccountFinancialYear = await downloadIfMissing(
            `./data/financials/get-account-statements/${account.accountNumber}/financial-years.json`,
            () =>
                fetchCondoApi(`/financials/get-financial-years/${account.accountNumber}/`)
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
            fetchCondoApi(`/financials/get-account-statement/${encodeURIComponent(accountId)}?isNextYear=false&associationId=${associationId}&shortenedName=${encodeURIComponent(yearId)}`)
                .then(async (r) => {
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
                fetchCondoApi(`/financials/get-account-statement-transaction-data`, {
                    headers: {
                        'content-type': 'application/x-www-form-urlencoded',
                    },
                    method: 'POST',
                    body: new URLSearchParams({
                        transactionNumber: transactionId.toString(),
                        accountNumber: '0',
                        associationId: associationId,
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

const argv = minimist(process.argv.slice(2), {
    string: ['token', 'manager-slug', 'manager-id', 'association-id'],
    boolean: ['help'],
});

if (argv['help']) {
    console.log(`Usage: ${chalk.bold('scrape')} [options]`);
    process.exit(0);
}

if (!argv['token']) {
    console.error(chalk.red('Error: token is required'));
    process.exit(1);
}

if (!argv['manager-slug']) {
    console.error(chalk.red('Error: manager-slug is required'));
    process.exit(1);
}

if (!argv['manager-id']) {
    console.error(chalk.red('Error: manager-id is required'));
    process.exit(1);
}

if (!argv['association-id']) {
    console.error(chalk.red('Error: association-id is required'));
    process.exit(1);
}

main({
    authToken: argv['token'],
    managerId: argv['manager-id'],
    managerSlug: argv['manager-slug'],
    associationId: argv['association-id'],
});
