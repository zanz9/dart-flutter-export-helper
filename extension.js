const vscode = require('vscode')
const fs = require('fs')
const path = require('path')

const extensionLink = 'https://marketplace.visualstudio.com/items?itemName=elmsec.dart-flutter-exports'

const skipFolders = ['l10n'] // folders to skip
const skipFiles = ['.g.dart'] // file patterns to skip

let userChoice = null // Variable to store user's choice for the current operation

function activate(context) {
  let disposable = vscode.commands.registerCommand('dart-flutter-exports.createExporterFiles', (uri) => {
    const folder = uri ? uri.fsPath : null

    if (folder) {
      userChoice = null // Reset user's choice for a new operation
      createExporterFilesRecursively(folder).then(() => {
        vscode.window.showInformationMessage(`Exporter files created recursively in ${folder}`)
      })
    }
  })

  context.subscriptions.push(disposable)
}

async function createExporterFilesRecursively(folder) {
  const folderName = path.basename(folder)
  const filePath = path.join(folder, `${folderName}.dart`)

  if (shouldSkip(folderName) || folderName == 'bloc') {
    return
  }

  // Check if the exporter file already exists
  if (fs.existsSync(filePath)) {
    // Check if the existing file is likely an export file
    const existingContent = fs.readFileSync(filePath, 'utf-8')
    const exportRegex = /export ['"](.+?)['"];/
    const isLikelyExportFile = exportRegex.test(existingContent)

    if (isLikelyExportFile) {
      // Show a confirmation dialog for overwrite, skip, or overwrite all
      const choices = ['Overwrite', 'Skip', 'Overwrite All']
      const overwriteChoice = userChoice
        ? choices[2]
        : await vscode.window.showInformationMessage(
            `Exporter file '${folderName}.dart' already exists in ${folder}. Do you want to overwrite it?`,
            ...choices
          )

      if (overwriteChoice === 'Overwrite All') {
        userChoice = 'Overwrite'
      }

      if (overwriteChoice === 'Overwrite' || userChoice === 'Overwrite') {
        // Continue with overwriting
        await generateAndWriteExporterFile(folder, filePath)
      } else if (overwriteChoice === 'Skip') {
        // Skip the folder
        vscode.window.showWarningMessage(`Skipping folder '${folderName}' as requested.`)
        return
      }
    } else {
      // Existing file is not likely an export file, show an error message and skip the folder
      vscode.window.showErrorMessage(
        `File '${folderName}.dart' already exists in ${folder}, and it may not be an export file. Skipping this folder.`
      )
      return
    }
  }

  // Export file doesn't exist, proceed with generating and writing
  await generateAndWriteExporterFile(folder, filePath)
}

async function generateAndWriteExporterFile(folder, filePath) {
  const subfolders = getSubdirectories(folder)

  // Generate exporter files for subfolders first
  for (const subfolder of subfolders) {
    await createExporterFilesRecursively(subfolder)
  }

  const folderName = path.basename(folder)

  // Only export files with a .dart extension
  const files = fs
    .readdirSync(folder)
    .filter(
      (file) =>
        !shouldSkip(file) &&
        path.extname(file) === '.dart' &&
        fs.statSync(path.join(folder, file)).isFile() &&
        file !== `${folderName}.dart`
    )

  // Generate exporter file for the current folder
  const fileContent = generateFileContent(folder, subfolders, files)

  try {
    fs.writeFileSync(filePath, fileContent)
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to create exporter files in ${folder}. Error: ${error.message}`)
    return
  }
}

function generateFileContent(folderName, subfolders, files) {
  const subfolderExports = subfolders
    .map((subfolder) => {
      const relativePath = path.relative(folderName, subfolder)
      return `export '${relativePath}/${path.basename(subfolder)}.dart';`
    })
    .join('\n')

  // Only export files that do not contain part-of statements
  const fileExports = files
    .filter((file) => !containsPartOfStatement(path.join(folderName, file)))
    .map((file) => `export '${file}';`)
    .join('\n')

  const exports = `${subfolderExports}\n${fileExports}`
  const fileName = folderName.split('/').pop()

  return `${exports}`
}

function containsPartOfStatement(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return /part of ['"].+\.dart['"];/i.test(content)
  } catch (error) {
    console.error(`Error reading file ${filePath}: ${error.message}`)
    return false
  }
}

function shouldSkip(name) {
  // Skip hidden files and files listed in skipFiles and folders listed in skipFolders
  const isHiddenFile = name.startsWith('.')
  const isSkippedFile = skipFiles.some((pattern) => name.endsWith(pattern))
  const isSkippedFolder = skipFolders.includes(name)
  return isHiddenFile || isSkippedFile || isSkippedFolder
}

function getSubdirectories(folder) {
  return fs
    .readdirSync(folder)
    .filter((file) => fs.statSync(path.join(folder, file)).isDirectory())
    .map((subfolder) => path.join(folder, subfolder))
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
  generateFileContent,
  shouldSkip,
  extensionLink,
}
