import json,pathlib
root=pathlib.Path(__file__).parent
page=(root/'src/page.html').read_text()
cfg=(root/'config.yaml').read_text()
js=''.join((root/'src'/f).read_text()+'\n' for f in ['core.js','game.js','ui.js'])
script='<script>\nconst DEFAULT_CONFIG='+json.dumps(cfg)+';\n(function(){\n'+js+'})();\n</script>'
(root/'index.html').write_text(page.replace('<!--SCRIPT-->',script))
print('built',len(page)+len(script))
