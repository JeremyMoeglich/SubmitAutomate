import { get_recent_forms } from 'get_form_data'
import path from 'path'
import { readFileSync } from 'fs'
import { upload_form } from 'api'
import { z } from 'zod'
import { get_appdir } from 'get_appdir'
import { error } from 'functional-utilities'

const data_dir = await get_appdir()

const json_content = readFileSync(path.join(data_dir, 'communicate.json'), 'utf8')
const { email, log_directory } = z.object({
    email: z.string(),
    log_directory: z.string(),
}).parse(JSON.parse(json_content))

const forms = await get_recent_forms(true)

const form = forms.find((f) => f.form.email === email)

upload_form(form?.form ?? error("Email doesn't exist"), log_directory)
