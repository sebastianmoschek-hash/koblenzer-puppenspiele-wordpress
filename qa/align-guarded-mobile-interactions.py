from pathlib import Path

session = Path('qa/editor-session-undo-e2e.mjs')
text = session.read_text()
old = "await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+18,box.y+box.height/2+10,{steps:4});await page.mouse.up();await page.waitForTimeout(180);"
new = "await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(380);await page.mouse.move(box.x+box.width/2+18,box.y+box.height/2+10,{steps:4});await page.mouse.up();await page.waitForTimeout(180);"
if old not in text:
    raise SystemExit('session-undo menu drag pattern not found')
session.write_text(text.replace(old, new, 1))

persistence = Path('qa/owner-all-persistence-e2e.mjs')
text = persistence.read_text()
old = """async function openDesign() {
  await page.locator('.kp-oa-tools').click();
  await page.locator('[data-action=\"design\"]').click();
  await page.locator('.kp-oa-sheet.is-design [data-design=\"header_radius\"]').waitFor({ state:'attached', timeout:10000 });
  await page.waitForTimeout(350);
}"""
new = """async function openDesign() {
  const tools = page.locator('.kp-oa-tools').first();
  await tools.waitFor({ state:'visible', timeout:10000 });
  await tools.click({ force:true });
  const designAction = page.locator('[data-action=\"design\"]').first();
  await designAction.waitFor({ state:'visible', timeout:10000 });
  await designAction.click({ force:true });
  await page.locator('.kp-oa-sheet.is-design [data-design=\"header_radius\"]').waitFor({ state:'attached', timeout:10000 });
  await page.waitForTimeout(350);
}"""
if old not in text:
    raise SystemExit('persistence openDesign pattern not found')
persistence.write_text(text.replace(old, new, 1))

print('PASS: browser lab aligned with guarded mobile interactions.')
