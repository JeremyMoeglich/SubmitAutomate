import { Browser, chromium, Page } from 'playwright'
import 'dotenv/config'
import { SkyFormData } from 'FormData'
import { sortBy } from 'lodash-es'
import { compareTwoStrings } from 'string-similarity'
import { base_package_set } from './asset_library/offer_description'
import { zubuchoption_id } from './asset_library/assets/zubuchoptionen'
import { Price } from './asset_library/priceable_asset_types'
import { get_price } from './asset_library/prices'
import { panic } from 'functional-utilities'
import download from 'download'

const default_timeout = 0

async function wait_for_load(page: Page) {
    await page.waitForLoadState('networkidle')
    await sleep(50)
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sleep_permanent(): Promise<never> {
    console.log('Sleeping.. forever...')
    return new Promise(() => { })
}

async function ensure_login(page: Page): Promise<void> {
    await page.type(
        '#s_swepi_1',
        process.env.SIEBEL_USERNAME ?? panic('SIEBEL_USERNAME not set')
    )
    await page.type(
        '#s_swepi_2',
        process.env.SIEBEL_PASSWORD ?? panic('SIEBEL_PASSWORD not set')
    )
    await page.click('#s_swepi_22')
}

export async function popup_prevent(page: Page): Promise<void> {
    const msgs = [
        'Achtung! Wählen Sie ein Angebot',
        'Verbindung mit Desktop Integration Siebel Agent',
    ]
    const selector = `div[role=dialog]:has(${msgs
        .map((msg) => `div:has-text("${msg}")`)
        .join(',')}) div div button:has-text("Ok") >> visible=true`
    try {
        while (true) {
            await page.click(selector, {
                timeout: 0,
            })
            console.log('closing popup')
        }
    } catch (e) {
        if (e instanceof Error && e.message.includes('Target closed')) {
            return
        }
        throw e
    }
}

async function get_page(log_path: string): Promise<[Page, Browser]> {
    const browser = await chromium.launch({
        headless: false,
        args: ['--start-maximized'],
        timeout: default_timeout,
    })
    const context = await browser.newContext({
        viewport: {
            width: 1920,
            height: 1080,
        },
    })
    const page = await context.newPage()
    page.setDefaultTimeout(default_timeout)
    try {
        await page.on('dialog', async (dialog) => {
            const message = await dialog.message()
            console.log('dialog', message)
            if (
                message ===
                'Bitte vergewissern Sie sich, dass der Drucker eingeschaltet ist'
            ) {
                console.log('clicking ok')
                await dialog.accept()
                let found_page = false
                let max_retries = 10
                while (!found_page && max_retries > 0) {
                    max_retries--
                    await context.waitForEvent('page')
                    const pages = await context.pages()
                    const pdf_page = pages.find((p) =>
                        p.url().includes('/siebel/pdf/contratti/')
                    )
                    // safe pdf to file
                    if (pdf_page) {
                        found_page = true
                        const pdf_path = `${log_path}`
                        await download(pdf_page.url(), pdf_path)
                    }
                }
                if (!found_page) {
                    throw new Error('Could not find pdf page')
                }
            } else {
                await dialog.dismiss()
            }
        })
        await page.goto(process.env.SIEBEL_URL ?? panic('SIEBEL_URL not set'))
        await ensure_login(page)
        popup_prevent(page)
    } catch (e) {
        await page.close()
        await browser.close()
        throw e
    }
    return [page, browser]
}

type section_name =
    | 'Adresse'
    | 'Vertrag'
    | 'Kunde & Bezahlung'
    | 'Technik & Services'
    | 'Übersicht'

async function go_to_section(page: Page, section: section_name): Promise<void> {
    const selector = `button:has-text("${section}")`
    if (await page.isDisabled(selector)) {
        console.log(`${section} is already selected`)
        return
    }
    await page.click(selector)
    await wait_for_load(page)
}

async function create_contract(page: Page) {
    console.log('Creating new contract')
    await page.click('text="Neuer Vertrag"')
    await page.click('#NewRecord')
}

async function get_contract(page: Page) {
    console.log('Using existing contract')
    await page.click('text="Neuer Vertrag"')
    {
        const selector = 'text="Vertrag Suchen"'
        await page.click(selector)
        await wait_for_load(page)
        await sleep(2000)
        await page.press(selector, 'Alt+KeyQ')
    }
    {
        const selector = 'td[aria-roledescription="Status"]'
        await page.click(selector)
        const input_selector = `${selector} input`
        await page.click(input_selector)
        await page.type(input_selector, 'IN BEARBEITUNG')
        await page.press(input_selector, 'Enter')
        await page.press(input_selector, 'Enter')
    }
    try {
        await page.click(
            'table[summary="Alle Bestellungen"] tbody tr td >> visible=true',
            {
                timeout: 4000,
            }
        )
    } catch (e) {
        create_contract(page)
        return
    }
    await sleep(1000)
    await page.click('text="Vertrag Anzeigen"')
    await go_to_section(page, 'Adresse')
    await go_to_section(page, 'Vertrag')
    await go_to_section(page, 'Kunde & Bezahlung')
    await go_to_section(page, 'Technik & Services')
    await go_to_section(page, 'Übersicht')
    await page.click('button span:has-text("Aktualisieren")')
    await go_to_section(page, 'Adresse')
}

export async function upload_form(
    form: SkyFormData,
    log_path: string
): Promise<void> {
    console.log(form)
    const [page, browser] = await get_page(log_path)
    try {
        await get_contract(page)
        console.log('Got contract')
        await handle_address_section(page, form)
        await sleep(1000)
        await handle_contract_section(page, form)
        await sleep(1000)
        await handle_customer_section(page, form)
        await sleep(1000)
        await handle_tech_section(page, form)
        await sleep(1000)
        await handle_overview_section(page, form)
        console.log('Done')
        await sleep_permanent()
    } finally {
        await page.close()
        await browser.close()
    }
}

async function field_input(
    page: Page,
    field_name: string,
    value: string,
    outer = ""
): Promise<void> {
    await field_input_by(page, field_name, value, "aria-label", outer)
}

async function field_input_by(
    page: Page,
    field_name: string,
    value: string,
    by: string,
    outer = ""
) {
    const selector = `${outer} input[${by}="${field_name}"]`
    await custom_field_input(page, selector, value)
}

async function custom_field_input(
    page: Page,
    selector: string,
    value: string,
): Promise<void> {
    console.log('Inputting', value, 'to', selector)
    await page.click(selector)
    await page.fill(selector, value)
    await page.press(selector, 'Enter')
}

async function get_field_value(
    page: Page,
    field_name: string,
    outer = ""
): Promise<string> {
    await wait_for_load(page)
    await sleep(500)
    const selector = `${outer} input[aria-label="${field_name}"]`
    const value = await page.$eval(selector, (el) => (el as any).value)
    console.log('Got', field_name, 'value', value)
    return value as string
}

async function event_click(page: Page, selector: string) {
    await page.$eval(selector, async (el) => {
        const event = document.createEvent('Events')
        event.initEvent('click', true, false)
        el.dispatchEvent(event)
    })
}

async function open_field_table(page: Page, field_name: string) {
    const selector = `input[aria-label="${field_name}"] + span[aria-label="Auswahlfeld"]`
    await page.waitForSelector(selector, { state: 'attached' })
    await wait_for_load(page)
    console.log('Opening table', selector)
    await event_click(page, selector)
}

async function extract_table(
    page: Page,
    table_selector: string,
    timeout: number = default_timeout
): Promise<[string, string][][]> {
    // returns rows of elements, each element is [value, selector]
    // the selector is implemented via nth
    try {
        await page.waitForSelector(table_selector, {
            state: 'visible',
            timeout,
        })
    } catch (e) {
        throw new Error(
            `Table ${table_selector} not visible, timeout on extract_table`
        )
    }
    await wait_for_load(page)
    await sleep(100)
    const table = (await page.$(table_selector)) ?? panic('Table not found')
    const rows = await table.$$('tr')
    const result = []
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i] ?? panic('Row not found')
        const cells = await row.$$('td')
        const row_result = []
        for (let j = 0; j < cells.length; j++) {
            const cell = cells[j] ?? panic('Cell not found')
            const value = await cell.evaluate((cell) => cell.textContent)
            const selector = `${table_selector} tr:nth-child(${i + 1
                }) td:nth-child(${j + 1})`
            row_result.push([value, selector] as [string, string])
        }
        result.push(row_result)
    }
    return result
}

async function close_table_popup(page: Page) {
    await page.click(
        'span.siebui-popup-button > button[data-display="Auswählen"]'
    )
    await wait_for_load(page)
}

async function enter_location(
    page: Page,
    location: {
        ort: string
        straße: string
        plz: string
    },
    outer: string
) {
    let plz_lst: [string, string][] | undefined = undefined
    let plz_lst_index = 0
    while ((await get_field_value(page, 'Postleitzahl', outer)) !== location.plz) {
        await field_input(page, 'Ort', location.ort, outer)
        if (plz_lst === undefined) {
            try {
                const table = await extract_table(
                    page,
                    'table[summary="Wähle Platz"] tbody',
                    3000
                )
                plz_lst = sortBy(
                    table
                        .map((row) => row[3] ?? panic('Plz not in table'))
                        .filter(([v, _]) => v.trim() !== ''),
                    ([v, _]) => -compareTwoStrings(v, location.plz)
                )
            } catch (e) {
                if (
                    e instanceof Error &&
                    e.message.includes('timeout on extract_table')
                ) {
                    console.log('No table, likely an exact match')
                    await field_input(page, 'Straße', location.straße)
                    try {
                        const table = await extract_table(
                            page,
                            'table[summary="Wähle Straße"] tbody',
                            3000
                        )
                        const obj = Object.fromEntries(
                            table.map(
                                (row) =>
                                    [row?.[3]?.[0], row?.[3]?.[1]] as [
                                        string,
                                        string
                                    ]
                            )
                        )
                        await page.click(
                            obj[location.plz] ?? panic('PLZ not in table')
                        )
                        await close_table_popup(page)
                    } catch (e) {
                        if (
                            !(
                                e instanceof Error &&
                                e.message.includes('timeout on extract_table')
                            )
                        ) {
                            throw e
                        }
                        if (
                            (await get_field_value(page, 'Postleitzahl', outer)) !==
                            location.plz
                        ) {
                            await field_input(
                                page,
                                'Postleitzahl',
                                location.plz,
                                outer
                            )
                        }
                    }
                    break
                }
                throw e
            }
        }
        await page.click(
            plz_lst[plz_lst_index]?.[1] ??
            panic('One of these is likely wrong "Ort", "Plz", "Straße"')
        )
        await close_table_popup(page)
        await field_input(page, 'Straße', location.straße, outer)
        try {
            const table = await extract_table(
                page,
                'table[summary="Wähle Straße"] tbody',
                3000
            )
            const obj = Object.fromEntries(
                table.map(
                    (row) => [row?.[3]?.[0], row?.[3]?.[1]] as [string, string]
                )
            )
            await page.click(obj[location.plz] ?? panic('PLZ not in table'))
            await close_table_popup(page)
            await sleep(200)
        } catch (e) {
            if (
                !(
                    e instanceof Error &&
                    e.message.includes('timeout on extract_table')
                )
            ) {
                throw e
            }
        }
        plz_lst_index++
    }
}

async function handle_address_section(
    page: Page,
    form: SkyFormData
): Promise<void> {
    console.log('Handling address section')
    //await go_to_section(page, "Adresse");
    {
        // Receive Type
        await field_input(
            page,
            'Empfangsart',
            {
                internet: 'INTERNET',
                cable: 'CABLE',
                satellit: 'SAT',
            }[form.empfangsart]
        )
    }
    {
        // Address
        await enter_location(page, {
            ort: form.ort,
            straße: form.straße,
            plz: form.plz,
        }, 'div[title="Addresse Formularapplet"]')
        await field_input(page, 'Hausnummer', form.hausnummer)
        await field_input(page, 'Adresszusatz', form.adresszusatz ?? '')
    }
    if (form.empfangsart !== "internet") {
        await field_input(page, 'Hardware des Kunden', form.hardware)
    }
    await field_input(
        page,
        'Vertragstyp',
        form.payback_number ? 'PAYBACK' : 'KEINE KOOPERATION'
    )
    if (form.payback_number) {
        await field_input(page, 'Externe Kundennummer', form.payback_number.replaceAll(" ", ""))
    }
}

function convert_base_package(package_id: base_package_set | '') {
    return (
        {
            entertainment: 'ENTERTAINMENT',
            entertainmentplus: 'ENTERTAINMENT PLUS',
            '': undefined,
        }[package_id] ?? panic()
    )
}

async function add_optional_package(page: Page, option_name: zubuchoption_id) {
    const names: Partial<Record<zubuchoption_id, string>> = {
        dazn_yearly: 'DAZN 12M 18,99€',
        dazn_monthly: 'DAZN 1M 29,99€',
        hdplus: 'HD+ 1 MONAT 6€ PRESELECT',
        multiscreen: 'MULTISCREEN SERVICE',
        plus18: 'BLUE MOVIE/SELECT18+ DUMMY',
        netflixstandard: 'HD NETFLIX 5€',
        trendsports: 'TRENDSPORTS 5,99€',
        netflixpremium: 'UHD NETFLIX 10€',
        skygoplus: 'SKY GO PLUS',
    }
    if (!(option_name in names)) {
        console.log(`Unimplemented option ${option_name}`)
        await page.pause()
        return
    }
    const table = await extract_table(
        page,
        'table[summary="Verfügbare Services"] tbody'
    )
    const obj = Object.fromEntries(
        table.map((row) => [row?.[1]?.[0], row?.[1]?.[1]] as [string, string])
    )
    await page.click(
        obj[names[option_name] ?? panic('Internal indexing error')] ??
        panic(`${option_name} not in table`)
    )
    await page.click('button[title="Verfügbare Services:Hinzufügen"]')
}

async function ccheck(page: Page, selector: string, bool: boolean) {
    console.log("Checking", selector, bool)
    if (bool) {
        await page.check(selector)
    } else {
        await page.uncheck(selector)
    }
}

async function add_optional_packages(
    page: Page,
    option_names: zubuchoption_id[]
) {
    const exceptions: zubuchoption_id[] = [
        'hdplus4monategratis',
        'uhd',
        'dazn_generic',
        'kids',
    ]

    while (true) {
        try {
            await page.click('button[title="Ausgewählter Service:Löschen"]', {
                timeout: 2000,
            })
        } catch (e) {
            if (
                e instanceof Error &&
                e.message.includes('Timeout')
            ) {
                break
            }
            throw e
        }
    }

    await ccheck(page, "input[aria-label='UHD-Sender']", option_names.includes("uhd"))

    if ('dazn_generic' in option_names) {
        throw new Error('dazn_generic is not valid')
    }

    for (const option_name of option_names.filter(
        (x) => !exceptions.includes(x)
    )) {
        await add_optional_package(page, option_name)
    }
}

function get_program_package(form: SkyFormData) {
    const order = ['CINEMA', 'SPORT', 'BUNDESLIGA']
    let lst = [`SKY ${convert_base_package(form.base_package)}`]
    lst = lst.concat(
        sortBy(
            form.premium_packages.map((p) => p.toLocaleUpperCase()),
            (p) => order.indexOf(p)
        )
    )
    if (form.zubuchoptionen.includes('kids')) {
        lst.push('KIDS')
    }
    const txt = lst.join(' + ')
    return txt
}

async function handle_contract_section(
    page: Page,
    form: SkyFormData
): Promise<void> {
    console.log('Handling contract section')
    await go_to_section(page, 'Vertrag')
    await sleep(2000)
    {
        await open_field_table(page, "Verkäufer")
        await custom_field_input(page, "td.siebui-popup-filter > span.siebui-popup-button > input.siebui-ctrl-input", process.env.SIEBEL_NAME ?? panic('SIEBEL_NAME not set'))
        await close_table_popup(page)
        await field_input(page, "Gutscheinnummer", process.env.SIEBEL_KEY ?? panic('SIEBEL_KEY not set'))
    }
    {
        // Angebot
        await open_field_table(page, 'Angebot')
        const table = await extract_table(
            page,
            'table[summary="Promotions"] tbody'
        )
        const obj = Object.fromEntries(
            table.map((row) => [row?.[2]?.[0], row?.[2]?.[1]])
        )
        await page.click(obj['12970'] ?? panic('Angebot not found'))
        await close_table_popup(page)
    }
    {
        // Paketfilter
        await field_input(
            page,
            'Paketfilter',
            (
                convert_base_package(form.base_package) +
                ' ' +
                (form.zubuchoptionen.includes('kids') ? 'KIDS' : '')
            ).trim()
        )
    }
    // ;
    {
        // Programmpaket
        const txt = get_program_package(form)
        await field_input(page, 'Programmpaket', txt)
    }
    await add_optional_packages(page, form.zubuchoptionen)
}

async function handle_customer_section(page: Page, form: SkyFormData) {
    console.log('Handling customer section')
    await go_to_section(page, 'Kunde & Bezahlung')
    await field_input(page, 'Vorname', form.vorname)
    await field_input(page, 'Name', form.nachname)
    await field_input(
        page,
        'Anrede',
        form.anrede === 'keine_angabe' ? '' : form.anrede.toUpperCase()
    )
    await field_input(
        page,
        'Titel',
        form.titel === 'Kein_Titel' ? '' : form.titel.toUpperCase()
    )
    await field_input(page, 'Geburtsdatum (TT/MM/JJJJ)', form.geburtsdatum)
    await field_input(page, 'E-Mail', form.email)
    await field_input(page, 'Telefonnummer 1', form.telefon)
    if (form.telefon_weitere.length >= 1) {
        await field_input(
            page,
            'Telefonnummer 2',
            form.telefon_weitere[0] ?? panic('No second phone number')
        )
        if (form.telefon_weitere.length === 2) {
            await field_input(
                page,
                'Telefonnummer 3',
                form.telefon_weitere[1] ?? panic('No third phone number')
            )
        } else if (form.telefon_weitere.length > 2) {
            throw new Error('Too many phone numbers')
        }
    }

    await ccheck(
        page,
        'input[aria-label="SEPA Bankinformationen vorhanden"]',
        form.sepa_vorhanden
    )
    if (form.sepa_vorhanden) {
        const iban_name = "IBAN"
        await field_input(page, iban_name, "")
        await sleep(3000)
        await field_input(page, iban_name, form.iban)
        await sleep(3000)
        /*try {
            const x_trim = (s: string) => {
                while (s.toUpperCase().endsWith("X")) {
                    s = s.slice(0, s.length - 1)
                }
                return s
            }
            const field_value = x_trim(await get_field_value(page, 'BIC'))
            if (field_value !== x_trim(form.bic) && form.bic.trim() !== "") {
                throw new Error(`BIC ${form.bic} does not match ${field_value}`)
            }
        } catch (e) {
            console.error(e)
            await sleep_permanent()
        }*/
    } else {
        await field_input(page, 'Bankleitzahl', form.bankleitzahl)
        await field_input(page, 'Kontonummer', form.kontonummer)
    }

    if (form.kontoinhaber === 'abonnent ist nicht kontoinhaber') {
        const vorname =
            form.kontoinhaber_info.split(' ').at(0) ?? panic('No first name')
        const nachname =
            form.kontoinhaber_info.split(' ').at(-1) ?? panic('No last name')
        await field_input_by(
            page,
            'LastNameSubscriber_Label_1',
            nachname,
            'aria-labelledby'
        )
        await field_input_by(
            page,
            'FirstNameSubscriber_Label_1',
            vorname,
            'aria-labelledby'
        )
    }
}

async function handle_tech_section(page: Page, form: SkyFormData) {
    console.log('Handling tech section')
    await go_to_section(page, 'Technik & Services')
    await page.click('button[title="Gerätemerkmale:Prüfen"]')
    if (form.abweichende_lieferadresse) {
        const outer = 'div[title="Abweichende Lieferadresse / DHL Packstation Formularapplet"]'
        await enter_location(page, {
            ort: form.ort_liefer,
            straße: form.straße_oder_packstation_liefer,
            plz: form.plz_liefer,
        }, outer)
        await field_input(
            page,
            'Anrede',
            form.anrede_liefer === 'keine_angabe'
                ? ''
                : form.anrede_liefer.toUpperCase(),
            outer
        )
        await field_input(
            page,
            'Titel',
            form.titel_liefer === 'Kein_Titel'
                ? ''
                : form.titel_liefer.toUpperCase(),
            outer
        )
        await field_input(page, 'Vorname', form.vorname_liefer, outer)
        await field_input(page, 'Name', form.nachname_liefer, outer)
        await field_input(
            page,
            'DHL Postnummer/Adresszusatz',
            form.hausnummer_oder_dhl_kundennummer_liefer,
            outer
        )
    }
}

function estimate_price(form: SkyFormData): {
    package_price: Price
    total_price: Price
} {
    const package_price = get_price([
        form.base_package,
        ...form.premium_packages,
    ])
    const accounted_zubuchoptionen: zubuchoption_id[] = [
        'kids',
        'netflixstandard',
        'netflixpremium',
        'skygoplus'
    ]
    const zubuchoptionen_price = get_price(
        form.zubuchoptionen.filter((o) => accounted_zubuchoptionen.includes(o))
    )
    const price: Price = {
        jahr: package_price.jahr + zubuchoptionen_price.jahr,
        monat: package_price.monat + zubuchoptionen_price.monat,
        singular: package_price.singular + zubuchoptionen_price.singular,
    }
    return {
        package_price: package_price,
        total_price: price,
    }
}

async function handle_overview_section(page: Page, form: SkyFormData) {
    console.log('Handling overview section')
    await go_to_section(page, 'Übersicht')
    await page.click('button[title="Service:Aktualisieren"]')
    const estimate = estimate_price(form)
    console.log('Estimate', estimate)
    {
        const actual_str = await page.inputValue(
            'input[aria-label="Abogebühren"]'
        )
        const actual_value = Number.parseFloat(actual_str.replace(',', '.'))
        if (actual_value !== estimate.total_price.jahr) {
            await page.pause()
            throw new Error(
                `Price mismatch: ${actual_value} != ${estimate.total_price.jahr}`
            )
        }
    }
    {
        const table = await extract_table(
            page,
            'table[summary="Service"] tbody'
        )
        const price_obj = Object.fromEntries(
            table.map((row) => [
                (row[1] ?? panic('Product column missing'))[0],
                Number.parseFloat(
                    (row[2] ?? panic('Price column missing'))[0].replace(
                        ',',
                        '.'
                    )
                ),
            ])
        )
        const program_package = get_program_package(form)
        const actual_price =
            price_obj[program_package] ?? panic('Product not found')
        if (actual_price !== estimate.package_price.monat) {
            await page.pause()
            throw new Error(
                `Price mismatch: ${actual_price} != ${estimate.package_price.monat}`
            )
        }
    }
    console.log('Price check passed')
}
