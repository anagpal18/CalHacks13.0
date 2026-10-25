// The gateway treats 1–5 files as one bill (usually the vendor's email + the PDF invoice).
// A dropped folder is one bill. Loose files: each PDF is a bill, and emails/notes are paired with PDFs in order
// (all of them go with the first PDF when the counts differ).

const MAX_FILES_PER_BILL = 5;

export function groupLooseFiles(files: File[]): File[][] {
  const pdfs = files.filter((file) => file.name.toLowerCase().endsWith(".pdf"));
  const others = files.filter((file) => !file.name.toLowerCase().endsWith(".pdf"));
  if (pdfs.length <= 1) return files.length ? [files.slice(0, MAX_FILES_PER_BILL)] : [];
  if (others.length === pdfs.length) return pdfs.map((pdf, index) => [others[index], pdf]);
  return pdfs.map((pdf, index) => (index === 0 ? [...others.slice(0, MAX_FILES_PER_BILL - 1), pdf] : [pdf]));
}

/** Reads a drop: folders become one bill each, loose files are grouped with groupLooseFiles. */
export async function readDroppedBills(dataTransfer: DataTransfer): Promise<File[][]> {
  const entries = [...dataTransfer.items].map((item) => item.webkitGetAsEntry?.()).filter((entry): entry is FileSystemEntry => Boolean(entry));
  if (!entries.some((entry) => entry.isDirectory)) return groupLooseFiles([...dataTransfer.files]);

  const bills: File[][] = [];
  const looseFiles: File[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) {
      const folderFiles = await readFolderFiles(entry as FileSystemDirectoryEntry);
      const billFiles = folderFiles.filter((file) => /\.(pdf|eml|txt)$/i.test(file.name)).slice(0, MAX_FILES_PER_BILL);
      if (billFiles.length) bills.push(billFiles);
    } else {
      looseFiles.push(await readEntryFile(entry as FileSystemFileEntry));
    }
  }
  return [...bills, ...groupLooseFiles(looseFiles)];
}

function readEntryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function readFolderFiles(folder: FileSystemDirectoryEntry): Promise<File[]> {
  const reader = folder.createReader();
  const children = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
  const files = await Promise.all(children.filter((child) => child.isFile).map((child) => readEntryFile(child as FileSystemFileEntry)));
  return files;
}
