let Cases = document.getElementsByClassName('case') 

let date= new Date();
let year= date.getFullYear();
let month=date.getMonth()+1
let day=date.getDate()
let datechaine=""

const monthName= ["janvier","fevrier","mars","avril","mai","juin","juillet","aout","septembre","octobre","novembre","decembre"];

const UP_MONTH='upmonth'
const DOWN_MONTH='downmonth'

function CALENDRIER_REDUCER(action) {

    switch(action){

        case UP_MONTH:
        
        if(month<12) month++
             
            else{
                year++
                month=1

            }
        break;

        case DOWN_MONTH:
            if(month>1) month--
 
            else{
            year--
            month = 12
            }    

            break;

        default:
            break;
}

calendrier(year,month)

}
document.getElementById('avant').onclick= function() {
    CALENDRIER_REDUCER(DOWN_MONTH) 
    console.log(month)
    console.log(year)
   // Combien de carataire pour le mois?
   if(month.length=1) datechaine=year.toString()+"0"+month.toString()
           
    else {
        datechaine=year.toString()+month.toString()

    }
    // Combien de carataire pour le jour?

    if (day.length=1) datechaine=datechaine+"0"+day.toString()
        else{
    
    datechaine=datechaine+day.toString()
    }
    console.log (datechaine)
    

}

document.getElementById('apres').onclick= function() {
    CALENDRIER_REDUCER(UP_MONTH)
    console.log(month)
    console.log(year)
    // Combien de carataire pour le mois?
    if(month.length=1) datechaine=year.toString()+"0"+month.toString()
           
    else {
        datechaine=year.toString()+month.toString()

    }
    // Combien de carataire pour le jour?

    if (day.length=1) datechaine=datechaine+"0"+day.toString()
        else{
    
    datechaine=datechaine+day.toString()
    }
  
    
    console.log (datechaine)
   
}

function calendrier(year,month)                 {

const monthnb=month+12*(year-2020)
let cld=[{dayStart:2, length:31, year:2020, month:"janvier"}]

for (let i=0; i<monthnb-1; i++)  {
    let yearsimule=2020+Math.floor(i/12)
    const monthssimulelongeur=[31,getfevrierlength(yearsimule),31,30,31,30,31,31,30,31,30,31]
    let monthsimuleindex =(i+1)-(yearsimule-2020)*12
    
    cld[i+1]={
    dayStart:(cld[i].dayStart+monthssimulelongeur[monthsimuleindex-1])%7,
    length: monthssimulelongeur[monthsimuleindex],
    year:2020+Math.floor((i+1)/12),
    month:monthName[monthsimuleindex]

            }

        if (cld[i+1].month ===undefined){
            cld[i+1].month="janvier"
            cld[i+1].length=31
                                        }

      


                                    }
for( let i=0; i<Cases.length; i++)  {

    Cases[i].innerText = ""
                                     } 
                                     
for (let i=0; i < cld[cld.length-1].length;i++ )  {
Cases[i + cld[cld.length-1].dayStart].innerText=i+1
}                
document.getElementById("cldT").innerText=cld[cld.length-1].month.toLocaleUpperCase()+" "+cld[cld.length-1].year     
                                                }

calendrier(year,month)

function getfevrierlength(year){
if (year % 4 === 0) return 29
else return 28
}



