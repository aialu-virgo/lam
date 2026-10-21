# Rebuilds build/desk/assets/virgo-logo.svg from the raster logo Vijay supplied:
#   python3 make-logo.py <logo.png> virgo-logo.svg
# Traces the red and dark lettering to vector paths; keeps the medallion as an upscaled, sharpened image.
import sys,base64,io,numpy as np,cv2,potrace
from PIL import Image
src=sys.argv[1];out=sys.argv[2]
im=np.array(Image.open(src).convert('RGB')).astype(np.int32)
H,W,_=im.shape;S=6
bg=im[2,2]
R,G,B=im[...,0],im[...,1],im[...,2]
red=(R>150)&(R-G>70)&(R-B>70)
dark=(R<150)&(G<150)&(B<160)&(np.abs(R-G)<40)
# medallion: gold-ish pixels in top area
d=np.abs(im-bg).sum(-1)
fg=d>40
# rows: medallion is above the red text
cx0,cx1=int(W*0.3),int(W*0.65)
prof=fg[:,cx0:cx1].sum(1);start=int(np.argmax(prof>0));gap=start
while gap<H and prof[gap]>0: gap+=1
med=np.zeros_like(fg);med[:gap,cx0:cx1]=fg[:gap,cx0:cx1]
red=red&~med;dark=dark&~med
print('medallion rows',start,gap)
ry=np.where(red.any(1))[0];red_top=ry.min()
n,lab,st,cen=cv2.connectedComponentsWithStats(dark.astype(np.uint8),8)
reg=np.zeros_like(dark)
for i in range(1,n):
    if cen[i][1]<red_top+8 and cen[i][0]>W*0.7: reg|=(lab==i)
# also include anti-aliased ring pixels around it
if reg.any():
    yy,xx=np.where(reg);RX0,RX1,RY0,RY1=xx.min(),xx.max(),yy.min(),yy.max()
    dark[max(RY0-3,0):RY1+4,max(RX0-3,0):RX1+4]=False
    rcx,rcy=(RX0+RX1+1)/2,(RY0+RY1+1)/2;rr=max(RX1-RX0,RY1-RY0)/2+1
else: rr=0
print('reg mark r',rr)
def trace(mask,color):
    m=cv2.resize(mask.astype(np.uint8)*255,(W*S,H*S),interpolation=cv2.INTER_CUBIC)
    m=cv2.GaussianBlur(m,(0,0),S*1.0)
    bm=potrace.Bitmap(m<=127)
    path=bm.trace(turdsize=20,alphamax=0.9,opticurve=True,opttolerance=0.8)
    parts=[]
    for c in path:
        s=c.start_point;seg=[f"M{s.x:.2f},{s.y:.2f}"]
        for g in c.segments:
            if g.is_corner: seg.append(f"L{g.c.x:.2f},{g.c.y:.2f}L{g.end_point.x:.2f},{g.end_point.y:.2f}")
            else: seg.append(f"C{g.c1.x:.2f},{g.c1.y:.2f} {g.c2.x:.2f},{g.c2.y:.2f} {g.end_point.x:.2f},{g.end_point.y:.2f}")
        parts.append("".join(seg)+"Z")
    return f'<path fill="{color}" fill-rule="evenodd" d="{"".join(parts)}"/>'
def med_color(mask):
    px=im[mask];r,g,b=np.median(px,0).astype(int);return f"#{r:02x}{g:02x}{b:02x}"
# deepen colors slightly toward the brand values seen in the logo core
redc=im[red];core=redc[(redc[:,0]>180)];rc=np.median(core,0).astype(int) if len(core) else np.median(redc,0).astype(int)
red_hex=f"#{rc[0]:02x}{rc[1]:02x}{rc[2]:02x}"
dk=im[dark];dc=np.median(dk[dk.sum(1)<200],0).astype(int) if (dk.sum(1)<200).any() else np.median(dk,0).astype(int)
dark_hex=f"#{dc[0]:02x}{dc[1]:02x}{dc[2]:02x}"
# medallion raster: bbox, upscale with lanczos + mild unsharp, alpha from distance to bg
ys,xs=np.where(med);y0,y1,x0,x1=ys.min()-3,ys.max()+4,xs.min()-3,xs.max()+4
crop=np.array(Image.open(src).convert('RGB'))[y0:y1,x0:x1]
up=cv2.resize(crop,((x1-x0)*S,(y1-y0)*S),interpolation=cv2.INTER_LANCZOS4)
blur=cv2.GaussianBlur(up,(0,0),2.0);up=cv2.addWeighted(up,1.5,blur,-0.5,0)
dd=np.abs(up.astype(np.int32)-bg).sum(-1);a=np.clip((dd-25)*255/45,0,255).astype(np.uint8)
a=cv2.GaussianBlur(a,(0,0),1.2)
rgba=np.dstack([up,a]);buf=io.BytesIO();Image.fromarray(rgba,'RGBA').save(buf,'PNG',optimize=True)
b64=base64.b64encode(buf.getvalue()).decode()
# tight overall bbox
allm=red|dark|med|reg;yy,xx=np.where(allm);by0,by1,bx0,bx1=yy.min()-2,yy.max()+3,xx.min()-2,xx.max()+3
vb=f"{bx0*S} {by0*S} {(bx1-bx0)*S} {(by1-by0)*S}"
svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{(bx1-bx0)*S}" height="{(by1-by0)*S}"><title>Virgo Group</title><image x="{x0*S}" y="{y0*S}" width="{(x1-x0)*S}" height="{(y1-y0)*S}" href="data:image/png;base64,{b64}"/>{trace(red,red_hex)}{trace(dark,dark_hex)}'+(f'<g fill="none" stroke="{dark_hex}"><circle cx="{rcx*S:.1f}" cy="{rcy*S:.1f}" r="{(rr-0.9)*S:.1f}" stroke-width="{1.5*S:.1f}"/></g><text x="{rcx*S:.1f}" y="{(rcy)*S:.1f}" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="{rr*1.3*S:.1f}" fill="{dark_hex}" text-anchor="middle" dominant-baseline="central">R</text>' if rr else '')+'</svg>'
open(out,'w').write(svg);print('svg',len(svg),'colors',red_hex,dark_hex,'vb',vb)
