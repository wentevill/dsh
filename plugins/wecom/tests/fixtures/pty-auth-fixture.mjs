#!/usr/bin/env node
if (!process.stdin.isTTY || !process.stdout.isTTY) process.exit(9)
process.stdin.setEncoding('utf8')
let buffer = ''
let phase = 'bot'
process.stdout.write('Bot ID: ')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  if (!buffer.includes('\n') && !buffer.includes('\r')) return
  buffer = ''
  if (phase === 'bot') {
    phase = 'secret'
    process.stdout.write('Secret: ')
  } else {
    process.exit(0)
  }
})
