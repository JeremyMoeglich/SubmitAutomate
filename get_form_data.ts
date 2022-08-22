import { SkyFormData } from 'FormData'
import { Email, get_emails } from 'get_emails/get_emails'
import { z } from 'zod'
import { compareTwoStrings } from 'string-similarity'
import { maxBy } from 'lodash-es'
import {
    base_package_set,
    premium_package_set,
} from './asset_library/offer_description'
import { zubuchoption_id } from './asset_library/assets/zubuchoptionen'

function trim_spaces(text: string): string {
    while (text.startsWith(' ')) {
        text = text.slice(1)
    }
    while (text.endsWith(' ')) {
        text = text.slice(0, -1)
    }
    return text
}

function error(message: string): never {
    throw new Error(message)
}

function get_object(text: string): Record<string, string | string[]> {
    const lines = text
        .replace(/\n*\t/g, '\t')
        .replace(/(?<=.)\n(?=[a-zA-Z](?!.*\t))/g, ';')
        .split('\n')
        .map((line) => trim_spaces(line))
    const obj: Record<string, string | string[]> = {}
    let last_key: string | undefined = undefined
    const key_amount: Record<string, number> = {}
    lines.forEach((line) => {
        const split_line = line.split('\t')
        if (split_line.length !== 2) {
            return
        }
        const [key, value] = [split_line[0]?.trim(), split_line[1]?.trim()] as [
            string,
            string
        ]
        key_amount[key] = (key_amount[key] ?? 0) + 1
        if (key in obj && last_key === key) {
            const current = obj[key]
            if (!Array.isArray(current)) {
                obj[key] = [
                    current ??
                        (() => {
                            throw "This won't happen"
                        })(),
                ]
            }
            if (value.trim()) {
                ;(obj?.[key] as string[]).push(value)
            }
        } else if (key in obj) {
            obj[`${key}_${key_amount[key]}`] = value
        } else {
            obj[key] = value
        }
        last_key = key
    })
    const new_obj: Record<string, string[] | string> = Object.fromEntries(
        Object.entries(obj).map(([key, value]) => {
            if (Array.isArray(value)) {
                return [
                    key,
                    value.flatMap((v) =>
                        v
                            .split(';')
                            .map((e) => e.trim())
                            .filter((e) => e !== '')
                    ),
                ] as [string, string[]]
            } else {
                if (value.includes(';')) {
                    return [
                        key,
                        value
                            .split(';')
                            .map((e) => e.trim())
                            .filter((e) => e !== ''),
                    ] as [string, string[]]
                } else {
                    return [key, value] as [string, string]
                }
            }
        })
    )
    return new_obj
}

function to_form_data(text: string): SkyFormData {
    const obj = get_object(text)

    const strp = z.string().parse
    const ostrp = (v: unknown) => {
        const str = strp(v)
        if (str === '') {
            return undefined
        } else {
            return str
        }
    }
    const arrp = z.array(z.string()).parse
    const lite =
        <T extends string>(lst: T[]) =>
        (v: unknown) => {
            if (lst.includes(strp(v) as T)) {
                return v as T
            }
            throw new Error(`Expected one of ${lst.join(', ')}`)
        }
    const clite =
        <T extends string>(lst: T[]) =>
        (v: unknown) => {
            if (lst.length === 0) {
                throw new Error('List is empty')
            }
            const val = strp(v)
            const similarities = lst.map((l, i) => [
                i,
                compareTwoStrings(val, l),
            ])
            const max = maxBy(similarities, ([, s]) => s)?.[0]
            if (max === undefined) {
                throw new Error('Internal error')
            }
            const max_val = lst[max]
            if (max_val === undefined) {
                throw new Error('Internal error')
            }
            return max_val
        }

    const anrede_clite = clite(['herr', 'frau', 'keine_angabe'])
    const title_clite = clite([
        'Kein_Titel',
        'ING',
        'DIPL.ING',
        'DIPL.KFM',
        'MAG',
        'DR',
        'DR.DR',
        'DR.MAG',
        'HFRT',
        'PROF',
        'MAG.FH',
        'UNIV.PROF',
        'UNIV.DOZ',
        'GRAF',
        'FÜRST',
        'FREIHERR',
        'BARON',
    ])

    const abweichende_lieferadresse =
        lite(['Ja', 'Nein'])(obj['Abweichende Lieferadresse gewünscht?']) ===
        'Ja'
            ? true
            : false
    const sepa_vorhanden =
        lite(['Ja', 'Nein'])(obj['SEPA Bankinformationen vorhanden?']) === 'Ja'
            ? true
            : false
    const kontoinhaber =
        clite(['Abonnent ist Kontoinhaber', 'Anderer'])(obj['Kontoinhaber']) ===
        'Abonnent ist Kontoinhaber'
            ? true
            : false
    const empfangsart = clite(['satellit', 'internet', 'cabel'])(
        obj['Ihre Empfangsart']
    )

    const base_string = strp(obj['In Ihrem Paket inklusive:'])

    const base_package: base_package_set = clite([
        'entertainment',
        'entertainmentplus',
    ])(base_string.split('(')[0])
    const premium_packages: premium_package_set[] = (() => {
        const options = arrp(
            obj['(Jahres-Abo, ab dem 13. Monat monatlich kündbar)']
        ).filter((v) => v !== '')
        const premium_string = options[0] ?? error('No premium string')
        const sect1 =
            premium_string.split(' --> ')[0] ?? error('Invalid premium string')
        const package_names = sect1.split(' + ').slice(1)
        const package_clite = clite(['cinema', 'sport', 'bundesliga'])
        return package_names.map((name) => package_clite(name))
    })()
    const zubuchoptionen: zubuchoption_id[] = (() => {
        const zubuchoptionen_lst = arrp(obj['Sky Zubuchoptionen'])
        const zubuchoptionen_table: Record<
            string,
            zubuchoption_id | undefined
        > = {
            'HD+ 4 Monate gratis testen (endet automatisch)':
                'hdplus4monategratis',
            'Netflix Premium 4K und 4 Geräte Upgrade --> ? 10 mtl.':
                'netflixpremium',
            'UHD für die gebuchten Pakete --> ? 5 mtl.': 'uhd',
            'DAZN jährlich --> ? 18,99 mtl. (Bestes Preisleistungsverhältnis, 12 Monatsraten)':
                'dazn_yearly',
            'Netflix HD und 2 Geräte Upgrade --> ? 5 mtl.': 'netflixstandard',
        }
        return zubuchoptionen_lst
            .filter((v) => {
                if (!(v in zubuchoptionen_table)) {
                    console.log(`Didn't find ${v} in table`)
                    return false
                }
                return zubuchoptionen_table[v] !== undefined
            })
            .map((v) => zubuchoptionen_table[v]) as zubuchoption_id[]
    })()

    return {
        ...{
            anrede: anrede_clite(obj.Anrede),
            titel: title_clite(obj.Titel),
            vorname: strp(obj.Vorname),
            nachname: strp(obj.Nachname),
            straße: strp(obj.Straße),
            hausnummer: strp(obj.Hausnummer),
            adresszusatz: ostrp(obj.Adresszusatz),
            plz: strp(obj.Postleitzahl),
            ort: strp(obj.Ort),
        },
        ...(abweichende_lieferadresse
            ? {
                  abweichende_lieferadresse: true as true,
                  anrede_liefer: anrede_clite(obj.Anrede_2),
                  titel_liefer: title_clite(obj.Titel_2),
                  vorname_liefer: strp(obj.Vorname_2),
                  nachname_liefer: strp(obj.Nachname_2),
                  firma_liefer: ostrp(obj.Firma),
                  straße_oder_packstation_liefer: strp(
                      obj['Straße oder Packstation']
                  ),
                  hausnummer_oder_dhl_kundennummer_liefer: strp(
                      obj['Hausnummer oder DHL Kundennummer']
                  ),
                  adresszusatz_liefer: ostrp(obj.Adresszusatz_2),
                  plz_liefer: strp(obj.Postleitzahl_2),
                  ort_liefer: strp(obj.Ort_2),
              }
            : {
                  abweichende_lieferadresse: false as false,
              }),
        ...{
            geburtsdatum: strp(
                obj['(Das Geburtsdatum muss dem des Abonnenten entsprechen)']
            ),
            email: strp(obj['Ihre E-Mail-Adresse']),
            telefon: strp(obj['Telefon (Kontaktnummer)']),
            telefon_weitere: strp(obj['Telefon (Weitere)'])
                .split(',')
                .map((s) => s.trim())
                .filter((s) => s !== ''),
        },
        ...(sepa_vorhanden
            ? {
                  sepa_vorhanden: true as true,
                  iban: strp(obj['IBAN']),
                  bic: strp(obj['BIC']),
              }
            : {
                  sepa_vorhanden: false as false,
                  bankleitzahl: strp(obj['Bankleitzahl (8-stellig)']),
                  kontonummer: strp(obj.Kontonummer),
              }),
        ...(kontoinhaber
            ? {
                  kontoinhaber: 'abonnent ist kontoinhaber',
              }
            : {
                  kontoinhaber: 'abonnent ist nicht kontoinhaber',
                  kontoinhaber_info: strp(obj['Kontoinhaber (Name, Vorname)']),
              }),
        ...(empfangsart === 'cabel'
            ? {
                  empfangsart: 'cable',
                  cable_receiver: strp(obj['Ihr Kabelnetzbetreiber']),
              }
            : {
                  empfangsart,
              }),
        ...{
            hardware: 'KEINE',
            payback_number: ostrp(obj['PAYBACK Kundennummer']),
            base_package,
            premium_packages,
            zubuchoptionen,
        },
    } as SkyFormData
}

export interface FormEmail extends Email {
    form: SkyFormData
}

export async function get_recent_forms(): Promise<FormEmail[]> {
    const emails = (await get_emails()).filter((email) =>
        email.title.includes('Ausgefülltes Formular')
    )
    const form_emails = emails.map((email) => {
        const form = to_form_data(email.body)
        return {
            ...email,
            form,
        }
    })
    return form_emails
}
