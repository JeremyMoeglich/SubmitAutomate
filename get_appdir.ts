import 'dotenv/config'
import { error } from 'functional-utilities'

export async function get_appdir(): Promise<string> {
    const { python } = await import('pythonia')
    const get_appdir_py = await python('appdirs')
    const appdir = await get_appdir_py.user_data_dir(
        process.env.APPNAME ?? error('APPNAME is not set'),
        process.env.APPAUTHOR ?? error('APPAUTHOR is not set')
    )
    ;(python as any).exit()
    return appdir
}

console.log(await get_appdir())
