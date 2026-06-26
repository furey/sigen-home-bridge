export const downloadUrl = async ({ url, filename }) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Export failed (${response.status})`)
  downloadBlob({ blob: await response.blob(), filename })
}

export const downloadBlob = ({ blob, filename }) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
