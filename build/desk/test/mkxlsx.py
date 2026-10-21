import sys,json,openpyxl
spec=json.load(open(sys.argv[1]));wb=openpyxl.Workbook();wb.remove(wb.active)
for name,rows in spec['sheets']:
    ws=wb.create_sheet(name)
    for r in rows: ws.append(r)
wb.save(spec['out'])
