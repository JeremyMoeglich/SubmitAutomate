import { readFile, writeFile } from 'fs'
import { has_property } from 'functional-utilities'
import get_root from 'get_root'
import path from 'path'
import { get_appdir } from 'get_appdir'

export interface Email {
    title: string
    body: string
}

const project_root = get_root()
const data_dir = await get_appdir()

export async function get_emails(use_cache: boolean): Promise<Email[]> {
    if (use_cache) {
        const content = await read_cache()
        if (content) {
            return content
        }
    }

    const { python } = await import('pythonia')
    const get_emails_py = await python(
        path.join(project_root, 'get_emails', 'get_emails.py')
    )
    const emails = []
    const python_emails = await get_emails_py.get_emails()
    for await (const email of python_emails) {
        emails.push({
            title: await email.title,
            body: (await email.body).replace(/\r\n/g, '\n'),
        })
    }
    ;(python as any).exit()

    await write_cache(emails)

    return emails
}

async function async_read_file(filename: string): Promise<string> {
    const promise = new Promise<string>((resolve, reject) => {
        readFile(filename, 'utf8', (err, data) => {
            if (err) {
                reject(err)
            } else {
                resolve(data)
            }
        })
    })
    return await promise
}

async function async_write_file(
    filename: string,
    content: string
): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
        writeFile(filename, content, 'utf8', (err) => {
            if (err) {
                reject(err)
            } else {
                resolve()
            }
        })
    })
    return await promise
}

async function read_cache(): Promise<Email[] | undefined> {
    try {
        const content = await async_read_file(
            path.join(data_dir, 'email_cache.json')
        )
        if (content) {
            return JSON.parse(content)
        }
    } catch (err) {
        if (
            has_property(err, 'code') &&
            typeof err.code === 'string' &&
            err.code === 'ENOENT'
        ) {
            return undefined
        } else {
            throw err
        }
    }
    return undefined
}

async function write_cache(emails: Email[]): Promise<void> {
    await async_write_file(
        path.join(data_dir, 'email_cache.json'),
        JSON.stringify(emails)
    )
}

get_emails(true).then((emails) => {
    let total_bytes = 0
    for (const email of emails) {
        total_bytes += email.body.length
    }
    console.log(`${emails.length} emails, ${total_bytes} bytes`)
})
