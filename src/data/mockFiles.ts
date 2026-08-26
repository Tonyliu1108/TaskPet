export type MockFile = {
  name: string
  meta: string
  kind: 'spreadsheet' | 'document' | 'folder' | 'pdf'
}

export const mockFiles: MockFile[] = [
  { name: '2026年销售数据.xlsx', meta: 'Excel · 2.4 MB', kind: 'spreadsheet' },
  { name: '市场调研资料.docx', meta: 'Word · 860 KB', kind: 'document' },
  { name: '产品图片', meta: '文件夹 · 24 项', kind: 'folder' },
  { name: '旧版销售报告.pdf', meta: 'PDF · 4.1 MB', kind: 'pdf' },
]
