import { get_recent_forms } from 'get_form_data'
import get_root from 'get_root'
import path from 'path'
import { readFileSync } from 'fs'
import { upload_form } from 'api'

const root = get_root()

const json_content = readFileSync(path.join(root, 'selected.json'), 'utf8')
const chosen: string = JSON.parse(json_content).email

const forms = await get_recent_forms(true)

const form = forms.find((f) => f.form.email === chosen)

const error = () => {
    throw new Error('Internal error')
}

upload_form(form?.form ?? error())
