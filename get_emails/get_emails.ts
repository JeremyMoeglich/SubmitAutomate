import get_root from 'get_root'
import path from 'path'

export interface Email {
    title: string
    body: string
}

const root = get_root()

export async function get_emails(): Promise<Email[]> {
    const { python } = await import('pythonia')
    const get_emails_py = await python(
        path.join(root, 'get_emails', 'get_emails.py')
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
    return emails
}