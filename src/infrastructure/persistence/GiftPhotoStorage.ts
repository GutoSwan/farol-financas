/** Fotos locais ficam fora do localStorage para não esgotar o limite dos registros financeiros. */
const DB_NAME = 'farol-financas-gift-photos-v1'
const STORE = 'photos'
export const MAX_GIFT_PHOTO_BYTES = 8 * 1024 * 1024

const OWNER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const GIFT_ID = /^[a-zA-Z0-9_-]{1,128}$/

/** Identifica a foto pelo dono e pelo presente. Não representa criptografia. */
export function giftPhotoStorageKey(userId: string, giftId: string): string {
  if (!OWNER_UUID.test(userId) || !GIFT_ID.test(giftId)) {
    throw new Error('Identidade ou presente inválido.')
  }
  return 'account:' + userId.toLowerCase() + ':gift:' + giftId
}

export function validateGiftPhoto(file: Blob): void {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Escolha uma foto PNG, JPG ou WebP.')
  }
  if (file.size === 0 || file.size > MAX_GIFT_PHOTO_BYTES) {
    throw new Error('A imagem deve ter até 8 MB e não pode estar vazia.')
  }
}

function database(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Este navegador não permite armazenar fotos locais.'))
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Não foi possível abrir o armazenamento das fotos.'))
    request.onblocked = () => reject(new Error('Feche outras abas do Farol e tente novamente.'))
  })
}

function photoOperation<T>(id: string, mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, resolve: (value: T) => void) => void): Promise<T> {
  return database().then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode)
    const store = transaction.objectStore(STORE)
    transaction.onerror = () => reject(new Error('Não foi possível acessar a foto deste presente.'))
    transaction.onabort = () => reject(new Error('A operação com a foto não foi concluída.'))
    transaction.oncomplete = () => db.close()
    try { operation(store, resolve) } catch (cause) { db.close(); reject(cause) }
  }))
}

export function getGiftPhoto(userId: string, giftId: string): Promise<Blob | null> {
  const key = giftPhotoStorageKey(userId, giftId)
  return photoOperation(key, 'readwrite', (store, resolve) => {
    const request = store.get(key)
    request.onsuccess = () => {
      if (request.result instanceof Blob) {
        resolve(request.result)
        return
      }
      // Compatibilidade com fotos antigas: só migra a foto quando a conta
      // autorizada exibe um presente que possui este identificador.
      const old = store.get(giftId)
      old.onsuccess = () => {
        const photo = old.result
        if (!(photo instanceof Blob)) {
          resolve(null)
          return
        }
        store.put(photo, key)
        store.delete(giftId)
        store.transaction.oncomplete = () => {
          store.transaction.db.close()
          resolve(photo)
        }
      }
    }
  })
}

export function saveGiftPhoto(userId: string, giftId: string, image: Blob): Promise<void> {
  validateGiftPhoto(image)
  const key = giftPhotoStorageKey(userId, giftId)
  return photoOperation(key, 'readwrite', (store, resolve) => {
    store.put(image, key)
    store.transaction.oncomplete = () => { store.transaction.db.close(); resolve() }
  })
}

export function deleteGiftPhoto(userId: string, giftId: string): Promise<void> {
  const key = giftPhotoStorageKey(userId, giftId)
  return photoOperation(key, 'readwrite', (store, resolve) => {
    store.delete(key)
    store.transaction.oncomplete = () => { store.transaction.db.close(); resolve() }
  })
}
