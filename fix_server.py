
import re

with open('server.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    # Check text handoff
    if 'return res.send(renderShareHandoffPage({' in line:
        # find what kind
        # If text
        if 'kind: "text"' in ''.join(lines[i-5:i+15]):
            new_lines.append('          return res.redirect(303, );
')
        else:
            new_lines.append('      fs.writeFileSync(path.join(SHARED_MEDIA_DIR, "latest_opus.bin"), file.buffer);
')
            new_lines.append('      return res.redirect(303, );
')
        continue
    new_lines.append(line)

with open('server.ts', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('Updated successfully')
