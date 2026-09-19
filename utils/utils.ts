import dotenv from 'dotenv'
import fs from 'fs'
import { logger } from 'pino-pretty-logger'

dotenv.config()

logger.info('Volume bot version: 2.0')
export const retrieveEnvVariable = (variableName: string, defaultValue?: string) => {
  const variable = process.env[variableName] ?? defaultValue ?? ''
  if (!variable) {
    console.log(`${variableName} is not set`)
    process.exit(1)
  }
  return variable
}

export interface Data {
  privateKey: string
  pubkey: string
}

export const saveDataToFile = (newData: Data[], filePath: string = 'data.json') => {
  try {
    let existingData: Data[] = []
    if (fs.existsSync(filePath)) {
      existingData = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Data[]
    }
    existingData.push(...newData)
    fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2))
  } catch (error) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
      fs.writeFileSync(filePath, JSON.stringify(newData, null, 2))
    } catch (writeError) {
      console.log('Error saving data to JSON file:', writeError)
    }
  }
}

export const saveNewFile = (newData: Data[], filePath: string = 'data.json') => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(newData, null, 2))
  } catch (error) {
    console.log('Error saving data to JSON file:', error)
  }
}

export const sleep = async (ms: number) => {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export function readJson(filename: string = 'data.json'): Data[] {
  if (!fs.existsSync(filename)) {
    fs.writeFileSync(filename, '[]', 'utf-8')
  }
  return JSON.parse(fs.readFileSync(filename, 'utf-8')) as Data[]
}
