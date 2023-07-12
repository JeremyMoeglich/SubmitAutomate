import { get_recent_forms } from 'get_form_data'
import path from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { upload_form } from 'api'
import { z } from 'zod'
import { get_appdir } from 'get_appdir'
import { panic } from 'functional-utilities'

const data_dir = await get_appdir()

const json_content = readFileSync(
    path.join(data_dir, 'communicate.json'),
    'utf8'
)
const { email, log_directory } = z
    .object({
        email: z.string(),
        log_directory: z.string(),
    })
    .parse(JSON.parse(json_content))

const forms = await get_recent_forms(false)

console.log(forms)

const form =
    forms.find((f) => f.form.email === email) ?? panic("Email doesn't exist")

writeFileSync(path.join(log_directory, 'form.json'), JSON.stringify(form.form))
writeFileSync(path.join(log_directory, 'body.txt'), form.body)

upload_form(form.form, log_directory)
