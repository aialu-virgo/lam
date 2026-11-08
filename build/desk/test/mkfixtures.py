# Synthetic upload fixtures for t22-t26 and t28 (item master, sales-employee master). No Virgo data. Usage: python3 -I mkfixtures.py OUT_DIR
import sys,os,openpyxl
out=sys.argv[1];os.makedirs(out,exist_ok=True)
# ---- item master: sheet FG, 402 data rows = 398 distinct codes in/out of scope + 1 blank code + 1 duplicate code + ...
wb=openpyxl.Workbook();ws=wb.active;ws.title='FG'
ws.append(['Item No.','Item Category','Inventory UoM','Active','Thickness','Size','Brand'])
sizes=['8X4','7X4','6X4','3660X1220','2440X1220','8X4','NA']
cats=[('Decorative Laminate',200),('Decorative Laminate Door',40),('PVC Sheet',40),('Compact Laminate',30),('ACP',50),('Cladding',20),('',20)]
n=0
for cat,cnt in cats:
    for i in range(cnt):
        n+=1;ws.append(['DEMO-IT-%04d'%n,cat,'Pcs' if n%11 else 'SQM','Y' if n%9 else 'N','%s mm'%(0.8+(n%4)*0.4),sizes[n%len(sizes)] if n%13 else 'n/a','DemoBrand%d'%(n%3)])
ws.append(['','Decorative Laminate','Pcs','Y','1 mm','8X4','DemoBrand0'])   # blank code -> rejected
ws.append(['DEMO-IT-0001','Decorative Laminate','Pcs','Y','1 mm','8X4','DemoBrand0'])   # duplicate -> rejected
assert ws.max_row-1==n+2==402,(ws.max_row,n)
wb.save(os.path.join(out,'demo-items.xlsx'))
# ---- sales-employee master
H=['Employee Code','FullName','Mobile No.','Email','Designation','Zone','Plant Name','*CompanyCode']
def book(path,sheets):
    wb=openpyxl.Workbook();wb.remove(wb.active)
    for name,hdr,rows in sheets:
        w=wb.create_sheet(name);w.append(hdr)
        for r in rows:w.append(r)
    wb.save(path)
sh=[]
code=0
def person(zone,name,plant='1012',mob='9876543210',mail=None,des='Sale Executive'):
    global code;code+=1
    return ['E-DM-%04d'%code,name,mob,mail if mail is not None else 'p%d@demo.test'%code,des,zone,'DEMO plant '+plant if plant else '',plant]
z=[[] for _ in range(5)]
for i in range(1,7):z[0 if i<4 else 1].append(person('Zone %d'%(1 if i<4 else 2),'DEMO Sales %d'%i,['1012','1013','1014'][i%3]))
fill=0
for zi in range(5):
    while len(z[zi])<7:
        fill+=1;z[zi].append(person('Zone %d'%(zi+1),'DEMO Person %d'%fill,'1013',des='Area Sales Manager'))
# 5 zones x 7 = 35 read; duplicate code on last row of zone 5 -> 1 rejected -> 34 loaded
z[4][-1][0]=z[0][0][0]
z[2][1][7]='9999';z[2][1][6]='DEMO plant X'          # unknown plant
z[2][2][0]='E-NOP-0001';z[2][2][7]='';z[2][2][6]=''                           # no plant
z[3][0][2]='98765432109876543210'                     # 20-digit mobile
z[1][-1][2]='1234'                                    # bad mobile (warn only)
sheets=[('ZONE %d'%(i+1),H,z[i]+([[None]*8] if i==0 else [])) for i in range(5)]
for nm in ['ACP','ALU','PVC','MDF','TAS IND','TAS ALU','Plant']:sheets.append((nm,H,[person('Zone 1','DEMO Other '+nm)]))
book(os.path.join(out,'demo-employees.xlsx'),sheets)
# v2: Read me sheet, extra columns, one ended person
H2=['Employee Code','FullName','Designation','Zone','Plant Name','*CompanyCode','Email','Mobile No.','B1 SlpCode','B1 Sales Employee Name','Reports To (Employee Code)','EndDate']
book(os.path.join(out,'demo-employees-v2.xlsx'),[('Read me',['Note'],[['Synthetic test file']]),('ZONE 1',H2,[
 ['DEMO-M1','DEMO Manager 1','Area Sales Manager','Zone 1','DEMO plant 1012','1012','mgr1@demo.test','9811111111','10','DEMO Manager 1','',''],
 ['DEMO-E1','Eve','Sale Executive','Zone 1','DEMO plant 1012','1012','eve@demo.test','9822222222','11','DEMO Sales 1','DEMO-M1',''],
 ['DEMO-E2','DEMO Sales 2 Two','Sale Executive','Zone 1','DEMO plant 1013','1013','e2@demo.test','9833333333','12','DEMO Sales 2 - Depot A','DEMO-M1',''],
 ['DEMO-E3','DEMO Sales 3','Sale Executive','Zone 1','DEMO plant 1012','1012','e3@demo.test','9844444444','13','DEMO Sales 3','DEMO-M1','20260131']])])
