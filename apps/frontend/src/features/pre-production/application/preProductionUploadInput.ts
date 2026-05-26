import { useRef, useState, type RefObject } from 'react'

export interface PreProductionUploadInputState {
  inputRef: RefObject<HTMLInputElement>
  uploading: boolean
  triggerUpload: (disabled?: boolean) => void
  uploadFile: (file: File | undefined, options: {
    disabled?: boolean
    onUpload: (file: File) => void
  }) => void
  resetUpload: () => void
}

export function usePreProductionUploadInput(): PreProductionUploadInputState {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  function triggerUpload(disabled = false) {
    if (disabled) return
    inputRef.current?.click()
  }

  function uploadFile(file: File | undefined, options: { disabled?: boolean; onUpload: (file: File) => void }) {
    if (!file || options.disabled) return
    setUploading(true)
    options.onUpload(file)
  }

  function resetUpload() {
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  return {
    inputRef: inputRef as RefObject<HTMLInputElement>,
    uploading,
    triggerUpload,
    uploadFile,
    resetUpload,
  }
}
