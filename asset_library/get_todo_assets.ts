import { assets } from './all_assets'

export const todo_assets = assets.filter((v) => {
    if (v.note.trim() === '[TODO]') {
        return true
    }
    return false
})
